import cds from '@sap/cds';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { accessCodeRequired, accessCodeValid, actionOf, allowed, createLimiter, hashKey, isKeyToken, needFor, verifySession, type Principal, type Role } from './srv/auth.js';
import { houseMemberPortal, PORTAL_RANGES, PortalError, validateHouseMember, type PortalRange } from './srv/house-member-portal.js';
import { registerProducerPipeline } from './srv/construct/registration.js';
import { ExplorerError, catalog, installDbProbe, monitorRequests, streamEvents, tableRows } from './srv/db-explorer.js';

/**
 * Access layer for /api/v1 (demo, not real authentication): resolves the caller from "Authorization: Bearer <token>"
 * (session token from login, or API key), rejects writes the role may not do, forces the actor to the authenticated
 * name and logs every write call. The business logic never sees an unauthenticated write.
 */
const ns = (n: string) => `mk7.controlcenter.${n}`;
const reject = (res: express.Response, status: number, code: string, message: string, params: object = {}) =>
  res.status(status).json({ error: { code, message, args: [JSON.stringify(params)] } });

/**
 * NAS/container-friendly structured logging. Never log authorization headers,
 * request bodies, query values, or response bodies: correlation_id is the
 * trace handle for support without leaking credentials or customer data.
 */
const apiLog = (event: string, fields: Record<string, unknown>) => {
  console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'mk7-control-center',
    event,
    ...fields,
  }));
};

/** Resolve the caller address as seen through Cloudflare/NAS reverse proxies.
 * Express derives req.ip/req.ips from X-Forwarded-For because trust proxy is
 * enabled below. Cloudflare's connecting address is preferred when present. */
const clientAddress = (req: express.Request) => {
  const cf = req.headers['cf-connecting-ip'];
  const cloudflareIp = (Array.isArray(cf) ? cf[0] : cf)?.trim();
  return (cloudflareIp || req.ip || req.socket.remoteAddress || 'unknown').slice(0, 100);
};

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
  app.use(['/api', '/odata'], monitorRequests);   // live database view: attributes every query to its HTTP request (memory only)

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
    const clientIp = clientAddress(req);
    const proxyChain = req.ips.slice(0, 10);
    let principal: Principal | undefined;
    // Register this before any auth/validation return so rejected requests are
    // visible in NAS logs as well.
    res.on('finish', () => {
      const fields = {
        correlation_id: correlationId,
        method: req.method,
        path: req.originalUrl.split('?')[0].slice(0, 200),
        status: res.statusCode,
        duration_ms: Date.now() - started,
        actor: principal?.actor ?? 'anonymous',
        via: principal?.via ?? '-',
        role: principal?.role ?? 'NONE',
        client_ip: clientIp,
        proxy_chain: proxyChain,
      };
      apiLog('api_response', fields);
      if (req.method !== 'GET' && req.path !== '/login') {
        void cds.db.run(INSERT.into(ns('ApiCalls')).entries({ at: new Date().toISOString(), actor: fields.actor, via: fields.via, method: req.method, path: fields.path, status: res.statusCode, durationMs: fields.duration_ms })).catch((error: unknown) => {
          apiLog('api_log_persist_failed', { correlation_id: correlationId, error: error instanceof Error ? error.message : String(error) });
        });
      }
    });
    apiLog('api_request', { correlation_id: correlationId, method: req.method, path: req.originalUrl.split('?')[0].slice(0, 200), client_ip: clientIp, proxy_chain: proxyChain });
    delete req.headers['x-ruhend-actor']; delete req.headers['x-ruhend-role']; delete req.headers['x-ruhend-via'];
    try { principal = await principalOf(req.headers.authorization); } catch { principal = undefined; }
    if (principal) { req.headers['x-ruhend-actor'] = principal.actor; req.headers['x-ruhend-role'] = principal.role; req.headers['x-ruhend-via'] = principal.via; }

    if (req.method === 'GET' && req.path.startsWith('/ProducerRegistrations') && !principal) {
      return reject(res, 401, 'AUTH_REQUIRED', 'A token is required to read producer registrations.');
    }
    if (req.method === 'GET' && req.path.startsWith('/db/') && !principal) {
      return reject(res, 401, 'AUTH_REQUIRED', 'A token is required to read the database explorer.');
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
    }
    next();
  });

  /** Read-only database explorer: tables, paged rows (secrets and personal data redacted) and the live request stream. */
  app.get('/api/v1/db/catalog', async (_req, res) => {
    try { return res.json(await catalog()); }
    catch (e) { return reject(res, 500, 'DB_CATALOG_FAILED', e instanceof Error ? e.message : String(e)); }
  });
  app.get('/api/v1/db/tables/:name/rows', async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    try { return res.json(await tableRows(String(req.params.name), { top: Number(q.top ?? 50), skip: Number(q.skip ?? 0), search: q.search, orderBy: q.orderBy || undefined, desc: q.desc === '1' || q.desc === 'true' })); }
    catch (e) { return e instanceof ExplorerError ? reject(res, e.status, e.code, e.message) : reject(res, 500, 'DB_ROWS_FAILED', e instanceof Error ? e.message : String(e)); }
  });
  app.get('/api/v1/db/stream', streamEvents);

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
    const required=['first_name','last_name','email','construct_type','production_type','plant_capacity_kw','market_location_identifier','market_location_malo','preferred_delivery_start','contract_start_utc','contract_end_utc','building_id'];
    const missing=required.filter((field)=>body[field]===null||body[field]===undefined||String(body[field]).trim()==='');
    if(missing.length) return fail(400,'VALIDATION_FAILED',`Required fields are missing: ${missing.join(', ')}. A producer registration needs both a MeLo (market_location_identifier) and a separate 11-digit MaLo (market_location_malo).`,missing.map(field=>({field,code:'REQUIRED',expected:field==='market_location_malo'?'11-digit MaLo':field==='market_location_identifier'?'33-character MeLo':'value'})));
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) return fail(400,'VALIDATION_FAILED','The email address is invalid.',[{field:'email',code:'INVALID_EMAIL'}]);
    if(body.construct_type!=='FEED_IN') return fail(400,'VALIDATION_FAILED','construct_type must be FEED_IN.',[{field:'construct_type',code:'UNSUPPORTED_VALUE'}]);
    const plant=body.plant_specifics as Record<string,unknown>|undefined, lat=Number(plant?.latitude), lon=Number(plant?.longitude), capacity=Number(body.plant_capacity_kw);
    if(!Number.isFinite(capacity)||capacity<=0) return fail(400,'VALIDATION_FAILED','plant_capacity_kw must be positive.',[{field:'plant_capacity_kw',code:'INVALID_NUMBER'}]);
    if(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lon)||lon < -180||lon > 180) return fail(400,'VALIDATION_FAILED','Valid plant coordinates are required.',[{field:'plant_specifics',code:'INVALID_COORDINATES'}]);
    if(!/^DE[0-9A-Z]{31}$/.test(String(body.market_location_identifier))) return fail(400,'VALIDATION_FAILED','market_location_identifier must be a valid MeLo ID.',[{field:'market_location_identifier',code:'INVALID_MELO'}]);
    if(!/^\d{11}$/.test(String(body.market_location_malo))) return fail(400,'VALIDATION_FAILED','market_location_malo must be an 11-digit MaLo ID.',[{field:'market_location_malo',code:'INVALID_MALO'}]);
    const dates=['preferred_delivery_start','contract_start_utc','contract_end_utc'] as const;
    if(dates.some(k=>typeof body[k]!=='string'||!/[zZ]|[+-]\d\d:\d\d$/.test(String(body[k]))||Number.isNaN(Date.parse(String(body[k]))))) return fail(400,'VALIDATION_FAILED','UTC timestamps with a timezone are required.',[{field:'timestamps',code:'INVALID_TIMESTAMP'}]);
    if(Date.parse(String(body.contract_end_utc))<=Date.parse(String(body.contract_start_utc))) return fail(400,'VALIDATION_FAILED','contract_end_utc must be later than contract_start_utc.',[{field:'contract_end_utc',code:'INVALID_DATE_RANGE'}]);
    const idempotencyKey=String(req.headers['idempotency-key']??'').trim();
    if(!idempotencyKey) return fail(400,'IDEMPOTENCY_KEY_REQUIRED','Send an Idempotency-Key header.');
    const entity=ns('ProducerRegistrationRequests');
    const existing=await cds.db.run(SELECT.one.from(entity).where({idempotencyKey})) as {ID:string;status:string;buildingId:string;marketLocationId:string;meteringLocationId?:string;generationFeedInMaloId?:string;createdAt:string;payload:string}|undefined;
    if(existing){
      if(existing.payload!==JSON.stringify(body)) return fail(409,'IDEMPOTENCY_CONFLICT','This Idempotency-Key was already used with a different payload.');
      return res.status(200).json({id:existing.ID,status:existing.status,building_id:existing.buildingId,market_location_identifier:existing.meteringLocationId ?? existing.marketLocationId,market_location_malo:existing.generationFeedInMaloId ?? existing.marketLocationId,created_at:existing.createdAt,simulation:true,sap_connection:'NOT_CONFIGURED',idempotent_replay:true});
    }
    const ID=cds.utils.uuid(), now=new Date().toISOString();
    await cds.db.tx(async tx=>{
      await tx.run(INSERT.into(entity).entries({ID,idempotencyKey,status:'ACCEPTED',constructType:body.construct_type,firstName:body.first_name,lastName:body.last_name,email:body.email,salutation:body.salutation,isBusiness:body.is_business,isReverseCharge:body.is_reverse_charge,deliveryStreet:body.deliv_address_street,deliveryHouseNumber:String(body.deliv_address_house_number??''),deliveryZipcode:String(body.deliv_address_zipcode??''),deliveryCity:body.deliv_address_city,subscriptionReason:body.subscription_reason,productionType:body.production_type,plantCapacityKw:capacity,latitude:lat,longitude:lon,marketLocationId:String(body.market_location_malo),meteringLocationId:String(body.market_location_identifier),generationFeedInMaloId:String(body.market_location_malo),buildingMarketLocationMalo:body.building_market_location_malo ? String(body.building_market_location_malo) : null,tranche:body.tranche,preferredDeliveryStart:new Date(String(body.preferred_delivery_start)).toISOString(),saasCustomerId:body.saas_customer_id,saasContractId:body.saas_contract_id,productName:body.product_name,consumerSaasContractId:body.consumer_saas_contract_id,controlResource:body.control_resource,technicalResources:body.technical_resources?JSON.stringify(body.technical_resources):null,contractStartUtc:new Date(String(body.contract_start_utc)).toISOString(),contractEndUtc:new Date(String(body.contract_end_utc)).toISOString(),buildingId:body.building_id,submittedBy:actor,payload:JSON.stringify(body)}));
        await tx.run(INSERT.into(ns('AuditEvents')).entries({operation:'PRODUCER_ONBOARDING_CREATED',maloId:String(body.market_location_malo),actor,eventTime:now,afterValue:JSON.stringify({ID,buildingId:body.building_id,status:'ACCEPTED'}),simulated:true}));
       await registerProducerPipeline(tx, {
          buildingId: String(body.building_id), meloId: String(body.market_location_identifier), generationFeedInMaloId: String(body.market_location_malo),
         productionType: String(body.production_type), preferredDeliveryStart: String(body.preferred_delivery_start),
         city: body.deliv_address_city ? String(body.deliv_address_city) : undefined,
         streetAddress: [body.deliv_address_street, body.deliv_address_house_number].filter(Boolean).join(' ') || undefined,
       }, actor);
     });
    res.location(`/api/v1/ProducerRegistrations/${ID}`);
    return res.status(201).json({id:ID,status:'SIMULATED_VERIFIED',verified:true,onboarding_action:'CONTINUE',building_id:body.building_id,market_location_identifier:body.market_location_identifier,market_location_malo:body.market_location_malo,created_at:now,simulation:true,verification_source:'SAP_MOCK_FIXTURE',sap_connection:'NOT_CONFIGURED',links:{self:`/api/v1/ProducerRegistrations/${ID}`}});
  });
});

cds.on('served', () => installDbProbe());

export default cds.server;
