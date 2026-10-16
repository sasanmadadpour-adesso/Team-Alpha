import cds from '@sap/cds';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { accessCodeRequired, accessCodeValid, actionOf, allowed, createLimiter, hashKey, isKeyToken, needFor, verifySession, type Principal, type Role } from './srv/auth.js';
import { houseMemberPortal, PORTAL_RANGES, PortalError, validateHouseMember, type PortalRange } from './srv/house-member-portal.js';
import { registerProducerPipeline } from './srv/construct/registration.js';

/**
 * Access layer for /api/v1 (demo, not real authentication): resolves the caller from "Authorization: Bearer <token>"
 * (session token from login, or API key), rejects writes the role may not do, forces the actor to the authenticated
 * name and logs every write call. The business logic never sees an unauthenticated write.
 */
const ns = (n: string) => `mk7.controlcenter.${n}`;
const reject = (res: express.Response, status: number, code: string, message: string, params: object = {}) =>
  res.status(status).json({ error: { code, message, args: [JSON.stringify(params)] } });

async function principalOf(header: string | undefined): Promise<Principal | undefined> {
  const token = /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1];
  if (!token) return undefined;
  if (!isKeyToken(token)) return verifySession(token);
  const key = await cds.db.run(SELECT.one.from(ns('ApiKeys')).columns('ID', 'name', 'role').where({ hash: hashKey(token), revokedAt: null })) as { ID: string; name: string; role: Role } | undefined;
  if (!key) return undefined;
  void cds.db.run(UPDATE(ns('ApiKeys')).set({ lastUsedAt: new Date().toISOString() }).where({ ID: key.ID })).catch(() => undefined);
  return { id: key.ID, name: key.name, role: key.role, via: 'KEY', actor: `Key: ${key.name}` };
}

const loginLimiter = createLimiter(8, 5 * 60_000);   // 8 failed sign-ins per 5 minutes per address

/** Security headers for the HTML shell (the API sends JSON only). */
const HTML_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
};

cds.on('bootstrap', (app: express.Express) => {
  app.set('trust proxy', true);   // behind Cloudflare / a reverse proxy: req.ip is the real client

  // The built UI is served by the same process (one port, one container). Hash routing: no history fallback needed.
  const uiDir = path.resolve(process.env.UI_DIR ?? 'app/dist');
  if (existsSync(path.join(uiDir, 'index.html'))) {
    app.use(express.static(uiDir, {
      index: 'index.html',
      setHeaders: (res, file) => {
        if (file.endsWith('.html')) { res.setHeader('Cache-Control', 'no-cache'); Object.entries(HTML_HEADERS).forEach(([k, v]) => res.setHeader(k, v)); }
        else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
    // Clean English URLs (/cases, /constructs/B-MUL-01 …): every page request that is not API, OData or a file gets the app shell.
    app.get(/^\/(?!api\/|odata\/)[^.]*$/, (_req, res) => {
      Object.entries(HTML_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(uiDir, 'index.html'));
    });
  }

  app.use('/api/v1', express.json({ limit: '25mb' }), async (req, res, next) => {
    const started = Date.now();
    const correlationId=String(req.headers['x-correlation-id']??cds.utils.uuid()); res.setHeader('x-correlation-id',correlationId);
    delete req.headers['x-ruhend-actor']; delete req.headers['x-ruhend-role']; delete req.headers['x-ruhend-via'];
    let principal: Principal | undefined;
    try { principal = await principalOf(req.headers.authorization); } catch { principal = undefined; }
    if (principal) { req.headers['x-ruhend-actor'] = principal.actor; req.headers['x-ruhend-role'] = principal.role; req.headers['x-ruhend-via'] = principal.via; }

    if (req.method === 'GET' && req.path.startsWith('/ProducerRegistrations') && !principal) {
      return reject(res, 401, 'AUTH_REQUIRED', 'A token is required to read producer registrations.');
    }
    if (req.method === 'GET' && ['/house-member-portal','/validate-house-member'].includes(req.path) && !principal) {
      return reject(res, 401, 'AUTH_REQUIRED', 'A token is required to access house-member data.');
    }

    if (req.method === 'POST') {
      const action = actionOf(req.path);
      const need = needFor(action);
      if (action === 'login' && accessCodeRequired()) {
        const ip = req.ip ?? 'unknown';
        if (loginLimiter.blocked(ip)) return reject(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again later.');
        if (!accessCodeValid((req.body as { code?: string } | undefined)?.code)) { loginLimiter.fail(ip); return reject(res, 401, 'CODE_INVALID', 'The access code is not correct.'); }
        loginLimiter.reset(ip);
      }
      if (!allowed(principal?.role, need)) {
        return principal
          ? reject(res, 403, 'FORBIDDEN', `Role ${principal.role} may not call ${action}.`, { role: principal.role, action })
          : reject(res, 401, 'AUTH_REQUIRED', `Sign in or send an API key to call ${action}.`, { action });
      }
      if (action !== 'login') {
        res.on('finish', () => {
          void cds.db.run(INSERT.into(ns('ApiCalls')).entries({ at: new Date().toISOString(), actor: principal?.actor ?? 'anonymous', via: principal?.via ?? '-', method: req.method, path: req.originalUrl.split('?')[0].slice(0, 200), status: res.statusCode, durationMs: Date.now() - started })).catch(() => undefined);
        });
      }
    }
    next();
  });

  app.get('/api/v1/house-member-portal',async(req,res)=>{
    const malo=String(req.query.malo??'').trim(),range=String(req.query.range??'').trim() as PortalRange,building=String(req.query.building??'').trim()||undefined;
    if(!malo) return reject(res,400,'MALO_REQUIRED','Query parameter malo is required.');
    if(!PORTAL_RANGES.includes(range)) return reject(res,400,'INVALID_RANGE',`range must be one of ${PORTAL_RANGES.join(', ')}.`,{ranges:PORTAL_RANGES});
    try{return res.json(await houseMemberPortal(malo,range,building));}
    catch(e){return e instanceof PortalError?reject(res,e.status,e.code,e.message,e.details):reject(res,500,'PORTAL_ERROR',e instanceof Error?e.message:String(e));}
  });

  app.get('/api/v1/validate-house-member',async(req,res)=>{
    const malo=String(req.query.malo??'').trim(),houseNumber=String(req.query.houseNumber??'').trim();
    return res.json(await validateHouseMember(malo,houseNumber));
  });

  /** External Registration MVP contract. The contract is stable; accepted records also enter the canonical process pipeline. */
  app.post('/api/v1/producer-onboardings', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const actor = String(req.headers['x-ruhend-actor'] ?? 'API_CLIENT');
    const fail = (status:number,code:string,message:string,details:object[]=[])=>(res.status(status).json({error:{code,message,details,correlation_id:res.getHeader('x-correlation-id')}}));
    const required=['first_name','last_name','email','construct_type','production_type','plant_capacity_kw','market_location_identifier','preferred_delivery_start','contract_start_utc','contract_end_utc','building_id'];
    const missing=required.filter((field)=>body[field]===null||body[field]===undefined||String(body[field]).trim()==='');
    if(missing.length) return fail(400,'VALIDATION_FAILED','Required fields are missing.',missing.map(field=>({field,code:'REQUIRED'})));
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) return fail(400,'VALIDATION_FAILED','The email address is invalid.',[{field:'email',code:'INVALID_EMAIL'}]);
    if(body.construct_type!=='FEED_IN') return fail(400,'VALIDATION_FAILED','construct_type must be FEED_IN.',[{field:'construct_type',code:'UNSUPPORTED_VALUE'}]);
    const plant=body.plant_specifics as Record<string,unknown>|undefined, lat=Number(plant?.latitude), lon=Number(plant?.longitude), capacity=Number(body.plant_capacity_kw);
    if(!Number.isFinite(capacity)||capacity<=0) return fail(400,'VALIDATION_FAILED','plant_capacity_kw must be positive.',[{field:'plant_capacity_kw',code:'INVALID_NUMBER'}]);
    if(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lon)||lon < -180||lon > 180) return fail(400,'VALIDATION_FAILED','Valid plant coordinates are required.',[{field:'plant_specifics',code:'INVALID_COORDINATES'}]);
    const dates=['preferred_delivery_start','contract_start_utc','contract_end_utc'] as const;
    if(dates.some(k=>typeof body[k]!=='string'||!/[zZ]|[+-]\d\d:\d\d$/.test(String(body[k]))||Number.isNaN(Date.parse(String(body[k]))))) return fail(400,'VALIDATION_FAILED','UTC timestamps with a timezone are required.',[{field:'timestamps',code:'INVALID_TIMESTAMP'}]);
    if(Date.parse(String(body.contract_end_utc))<=Date.parse(String(body.contract_start_utc))) return fail(400,'VALIDATION_FAILED','contract_end_utc must be later than contract_start_utc.',[{field:'contract_end_utc',code:'INVALID_DATE_RANGE'}]);
    const idempotencyKey=String(req.headers['idempotency-key']??'').trim();
    if(!idempotencyKey) return fail(400,'IDEMPOTENCY_KEY_REQUIRED','Send an Idempotency-Key header.');
    const entity=ns('ProducerRegistrationRequests');
    const existing=await cds.db.run(SELECT.one.from(entity).where({idempotencyKey})) as {ID:string;status:string;buildingId:string;marketLocationId:string;createdAt:string;payload:string}|undefined;
    if(existing){
      if(existing.payload!==JSON.stringify(body)) return fail(409,'IDEMPOTENCY_CONFLICT','This Idempotency-Key was already used with a different payload.');
      return res.status(200).json({id:existing.ID,status:existing.status,building_id:existing.buildingId,market_location_identifier:existing.marketLocationId,created_at:existing.createdAt,simulation:true,sap_connection:'NOT_CONFIGURED',idempotent_replay:true});
    }
    const ID=cds.utils.uuid(), now=new Date().toISOString();
    await cds.db.tx(async tx=>{
      await tx.run(INSERT.into(entity).entries({ID,idempotencyKey,status:'ACCEPTED',constructType:body.construct_type,firstName:body.first_name,lastName:body.last_name,email:body.email,salutation:body.salutation,isBusiness:body.is_business,isReverseCharge:body.is_reverse_charge,deliveryStreet:body.deliv_address_street,deliveryHouseNumber:String(body.deliv_address_house_number??''),deliveryZipcode:String(body.deliv_address_zipcode??''),deliveryCity:body.deliv_address_city,subscriptionReason:body.subscription_reason,productionType:body.production_type,plantCapacityKw:capacity,latitude:lat,longitude:lon,marketLocationId:String(body.market_location_identifier),tranche:body.tranche,preferredDeliveryStart:new Date(String(body.preferred_delivery_start)).toISOString(),saasCustomerId:body.saas_customer_id,saasContractId:body.saas_contract_id,productName:body.product_name,consumerSaasContractId:body.consumer_saas_contract_id,controlResource:body.control_resource,technicalResources:body.technical_resources?JSON.stringify(body.technical_resources):null,contractStartUtc:new Date(String(body.contract_start_utc)).toISOString(),contractEndUtc:new Date(String(body.contract_end_utc)).toISOString(),buildingId:body.building_id,submittedBy:actor,payload:JSON.stringify(body)}));
       await tx.run(INSERT.into(ns('AuditEvents')).entries({operation:'PRODUCER_ONBOARDING_CREATED',maloId:String(body.market_location_identifier),actor,eventTime:now,afterValue:JSON.stringify({ID,buildingId:body.building_id,status:'ACCEPTED'}),simulated:true}));
       await registerProducerPipeline(tx, {
         buildingId: String(body.building_id), marketLocationId: String(body.market_location_identifier),
         productionType: String(body.production_type), preferredDeliveryStart: String(body.preferred_delivery_start),
         city: body.deliv_address_city ? String(body.deliv_address_city) : undefined,
         streetAddress: [body.deliv_address_street, body.deliv_address_house_number].filter(Boolean).join(' ') || undefined,
       }, actor);
     });
    res.location(`/api/v1/ProducerRegistrations/${ID}`);
    return res.status(201).json({id:ID,status:'ACCEPTED',building_id:body.building_id,market_location_identifier:body.market_location_identifier,created_at:now,simulation:true,sap_connection:'NOT_CONFIGURED',links:{self:`/api/v1/ProducerRegistrations/${ID}`}});
  });
});

export default cds.server;
