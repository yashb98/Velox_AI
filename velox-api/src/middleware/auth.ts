import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

// Extend Express Request so downstream handlers can read auth context
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        orgId: string;
      };
    }
  }
}

// Check if Clerk is enabled
const CLERK_ENABLED = process.env.CLERK_ENABLED === "true";
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "";

/**
 * requireAuth middleware
 *
 * When CLERK_ENABLED=true: Verifies the Bearer JWT issued by Clerk.
 * When CLERK_ENABLED=false: Bypasses auth and uses dev user credentials.
 *
 * On success it attaches `req.auth = { userId, orgId }` for downstream handlers.
 *
 * Usage:
 *   app.use('/api/billing', requireAuth, billingRoutes);
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // DEV MODE: Skip Clerk authentication
  if (!CLERK_ENABLED) {
    req.auth = {
      userId: process.env.DEV_USER_ID || "dev-user-001",
      orgId: process.env.DEV_ORG_ID || "dev-org-001",
    };
    logger.debug({ userId: req.auth.userId }, "Auth bypassed (CLERK_ENABLED=false)");
    next();
    return;
  }

  // PRODUCTION MODE: Verify Clerk JWT
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized — missing Bearer token" });
    return;
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    // Dynamic import to avoid loading Clerk when disabled
    const { verifyToken } = await import("@clerk/backend");

    // verifyToken validates the JWT signature, expiry, and issuer against
    // the Clerk JWKS endpoint (public keys cached internally by the SDK).
    const payload = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
    });

    req.auth = {
      userId: payload.sub,
      // Clerk embeds the active org id in the token as `org_id`
      orgId: (payload as any).org_id as string,
    };

    next();
  } catch (err) {
    logger.warn({ err, reqId: req.id }, "JWT verification failed");
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
