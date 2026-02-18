import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@clerk/backend";
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

// Clerk JWKS URL — verifyToken fetches and caches the public keys automatically
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "";

/**
 * requireAuth middleware
 *
 * Verifies the Bearer JWT issued by Clerk. On success it attaches
 * `req.auth = { userId, orgId }` for downstream route handlers to use.
 *
 * Usage:
 *   app.use('/api/billing', requireAuth, billingRoutes);
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized — missing Bearer token" });
    return;
  }

  const token = authHeader.replace("Bearer ", "");

  try {
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
