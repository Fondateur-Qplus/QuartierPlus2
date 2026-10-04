import { pool } from "../db/pool.js";
import { IS_PROMO_FREE_ACCESS } from "../config/monetization.js";

export const proRoleGuard = (requiredPlan) => async (request, response, next) => {
  if (IS_PROMO_FREE_ACCESS) {
    request.proSubscription = {
      plan_type: requiredPlan,
      status: "ACTIVE",
      starts_at: new Date(),
      expires_at: new Date("2099-12-31T23:59:59.999Z"),
      is_promo_free_access: true,
    };
    return next();
  }
  try {
    const result = await pool.query(
      `SELECT plan_type, status, starts_at, expires_at
       FROM subscriptions
       WHERE user_id = $1
         AND plan_type = $2
         AND status = 'ACTIVE'
         AND starts_at <= NOW()
         AND expires_at > NOW()
       ORDER BY expires_at DESC
       LIMIT 1`,
      [request.auth.userId, requiredPlan],
    );
    const subscription = result.rows[0];
    const startsAt = Date.parse(subscription?.starts_at);
    const expiresAt = Date.parse(subscription?.expires_at);
    if (
      !subscription ||
      subscription.plan_type !== requiredPlan ||
      subscription.status !== "ACTIVE" ||
      !Number.isFinite(startsAt) ||
      startsAt > Date.now() ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      return response.status(403).json({
        error: "Un abonnement actif correspondant est requis.",
      });
    }
    request.proSubscription = subscription;
    return next();
  } catch (error) {
    return next(error);
  }
};
