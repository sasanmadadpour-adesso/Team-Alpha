namespace mk7.controlcenter;

using { cuid, managed } from '@sap/cds/common';

/** Persistent technical records used to verify the Phase A vertical connection. */
entity SystemStatuses : cuid, managed {
  key code       : String(40) @assert.unique;
      label      : String(120);
      environment: String(30);
      sapConnected: Boolean default false;
}
