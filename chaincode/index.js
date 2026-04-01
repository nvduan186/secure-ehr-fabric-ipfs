'use strict';

const EHRRegistryContract = require('./lib/ehr-registry');
const AccessControlContract = require('./lib/access-control');
const AuditLogContract = require('./lib/audit-log');

module.exports.EHRRegistryContract = EHRRegistryContract;
module.exports.AccessControlContract = AccessControlContract;
module.exports.AuditLogContract = AuditLogContract;

module.exports.contracts = [EHRRegistryContract, AccessControlContract, AuditLogContract];
