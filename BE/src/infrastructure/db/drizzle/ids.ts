/**
 * Id helpers now live in src/utils/ids.ts so that controllers and validators can
 * use `isValidId` without importing from the database layer. Re-exported here so
 * the schema and repositories can keep their local import.
 */
export { genObjectId, isValidId } from "../../../utils/ids.js";
