import express from "express";
import {
  createContact,
  createEntry,
  deleteContact,
  deleteEntry,
  getContactAccount,
  listContacts,
  setEntryReturned,
  settleContact,
  updateContact,
  updateEntry
} from "../controllers/carnetController.js";

const router = express.Router();

// People
router.get("/contacts", listContacts);
router.post("/contacts", createContact);
router.get("/contacts/:id", getContactAccount);
router.put("/contacts/:id", updateContact);
router.delete("/contacts/:id", deleteContact);

// What was given / received, object loans, notes
router.post("/contacts/:id/entries", createEntry);
router.put("/contacts/:id/entries/:entryId", updateEntry);
// PUT (not PATCH): the API CORS config only allows GET / POST / PUT / DELETE
router.put("/contacts/:id/entries/:entryId/returned", setEntryReturned);
router.delete("/contacts/:id/entries/:entryId", deleteEntry);

// Settle up: one entry that brings the balance back to zero
router.post("/contacts/:id/settle", settleContact);

export default router;
