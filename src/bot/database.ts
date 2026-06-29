import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "../lib/logger.js";

export interface UserData {
  userId: number;
  username?: string;
  firstName?: string;
  registeredAt: string;
  nationalId?: string;
  phone?: string;
  birthDate?: string;
  deposited: boolean;
  bonusActivated: boolean;
  licenseCode?: string;
  withdrawalCompleted: boolean;
  referralCode: string;
  referredBy?: number;
  referrals: number[];
  referralDeposits: number;
  currentState: string;
  adminState?: string;
}

interface DB {
  users: Record<string, UserData>;
}

const DB_PATH = join(process.cwd(), "bot_db.json");

let _dbCache: DB | null = null;
let _dirtyTimer: ReturnType<typeof setTimeout> | null = null;

function loadDB(): DB {
  if (_dbCache) return _dbCache;
  if (!existsSync(DB_PATH)) {
    _dbCache = { users: {} };
    return _dbCache;
  }
  try {
    _dbCache = JSON.parse(readFileSync(DB_PATH, "utf-8")) as DB;
    return _dbCache;
  } catch (e) {
    logger.error({ e }, "loadDB parse error — starting fresh");
    _dbCache = { users: {} };
    return _dbCache;
  }
}

function saveDB(db: DB): void {
  _dbCache = db;
  if (_dirtyTimer) clearTimeout(_dirtyTimer);
  _dirtyTimer = setTimeout(() => {
    try {
      writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
    } catch (e) {
      logger.error({ e }, "saveDB write error");
    }
    _dirtyTimer = null;
  }, 200);
}

function makeRandomCode(length: number, prefix = ""): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix;
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getUser(userId: number): UserData | null {
  const db = loadDB();
  return db.users[String(userId)] ?? null;
}

export function getUserByReferralCode(code: string): UserData | null {
  const db = loadDB();
  return Object.values(db.users).find(u => u.referralCode === code) ?? null;
}

export function getOrCreateUser(
  userId: number,
  username?: string,
  firstName?: string,
  referredBy?: number,
): UserData {
  const db = loadDB();
  const key = String(userId);
  if (!db.users[key]) {
    db.users[key] = {
      userId,
      username,
      firstName,
      registeredAt: new Date().toLocaleDateString("fa-IR"),
      deposited: false,
      bonusActivated: false,
      licenseCode: undefined,
      withdrawalCompleted: false,
      referralCode: makeRandomCode(8, "REF"),
      referredBy,
      referrals: [],
      referralDeposits: 0,
      currentState: "idle",
      adminState: undefined,
    };
    if (referredBy) {
      const refKey = String(referredBy);
      const refUser = db.users[refKey];
      if (refUser) {
        if (!refUser.referrals) refUser.referrals = [];
        if (!refUser.referrals.includes(userId)) {
          refUser.referrals.push(userId);
        }
      }
    }
    saveDB(db);
  } else {
    // migrate old field names from previous versions
    const u = db.users[key]! as unknown as Record<string, unknown>;
    let changed = false;
    if (u["creditCharged"] !== undefined && u["deposited"] === undefined) {
      u["deposited"] = u["creditCharged"]; changed = true;
    }
    if (u["processCompleted"] !== undefined && u["withdrawalCompleted"] === undefined) {
      u["withdrawalCompleted"] = u["processCompleted"]; changed = true;
    }
    if (u["confirmCode"] !== undefined && u["licenseCode"] === undefined) {
      u["licenseCode"] = u["confirmCode"]; changed = true;
    }
    if (u["bonusActivated"] === undefined) { u["bonusActivated"] = false; changed = true; }
    if (u["deposited"] === undefined) { u["deposited"] = false; changed = true; }
    if (u["withdrawalCompleted"] === undefined) { u["withdrawalCompleted"] = false; changed = true; }
    if (!u["referralCode"]) { u["referralCode"] = makeRandomCode(8, "REF"); changed = true; }
    if (!u["referrals"]) { u["referrals"] = []; changed = true; }
    if (u["referralDeposits"] === undefined) { u["referralDeposits"] = 0; changed = true; }
    if (u["currentState"] === undefined) { u["currentState"] = "idle"; changed = true; }
    if (changed) saveDB(db);
  }
  return db.users[key]!;
}

export function updateUser(userId: number, updates: Partial<UserData>): void {
  const db = loadDB();
  const key = String(userId);
  if (db.users[key]) {
    db.users[key] = { ...db.users[key]!, ...updates };
    saveDB(db);
  }
}

export function setUserState(userId: number, state: string): void {
  const db = loadDB();
  const key = String(userId);
  const u = db.users[key];
  if (u) { u.currentState = state; saveDB(db); }
}

export function getUserState(userId: number): string {
  return loadDB().users[String(userId)]?.currentState ?? "idle";
}

export function getAdminState(adminId: number): string | undefined {
  return loadDB().users[String(adminId)]?.adminState;
}

export function setAdminState(adminId: number, state: string | undefined): void {
  const db = loadDB();
  const key = String(adminId);
  const u = db.users[key];
  if (u) { u.adminState = state; saveDB(db); }
}

export function recordReferralDeposit(referrerId: number): void {
  const db = loadDB();
  const key = String(referrerId);
  const u = db.users[key];
  if (u) {
    u.referralDeposits = (u.referralDeposits ?? 0) + 1;
    saveDB(db);
  }
}

export function getAllUsers(): UserData[] {
  return Object.values(loadDB().users);
}

export function deleteUser(userId: number): void {
  const db = loadDB();
  delete db.users[String(userId)];
  saveDB(db);
}

export function generateLicenseCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `LIC-${rand(4)}-${rand(4)}-${rand(4)}`;
}

export function generateGiftCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `GIFT-${rand(5)}-${rand(5)}`;
}
