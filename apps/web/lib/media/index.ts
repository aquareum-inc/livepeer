import "server-only";

import { createMediaStore, type MediaStore } from "@livepeer/api-client";

import { storeOver } from "../data/database";
import { postgresUploadRecords } from "./postgres";
import { storage } from "./storage";

const records = storeOver(postgresUploadRecords);

/** The instance's own files: tickets and records in its database, the files in its storage. */
export function media(): MediaStore {
  return createMediaStore({ records: records(), storage: storage() });
}

/**
 * The same, for handing to an API client: the database and storage are looked up when a file is asked
 * about, not when the client is built, since most requests never touch a file.
 */
export const instanceMedia: MediaStore = {
  requestUpload: (account, request) => media().requestUpload(account, request),
  completeUpload: (account, id) => media().completeUpload(account, id),
  list: (account) => media().list(account),
  urlFor: (id) => media().urlFor(id),
  remove: (account, id) => media().remove(account, id),
  forget: (userId) => media().forget(userId),
  sweep: () => media().sweep(),
};
