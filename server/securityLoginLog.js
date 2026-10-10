/**
 * Security login event logging handler.
 *
 * Extracted from server.js so the endpoint logic can be unit-tested
 * without starting the full Express application or connecting to real
 * Firebase services.
 *
 * Security model:
 *  - SUCCESS events MUST present a valid Firebase ID token (Bearer header).
 *    Identity (uid, name, role, school) is resolved server-side from the
 *    verified token — never from client-supplied body fields.
 *  - FAILED events are accepted without authentication. Only the lowercased
 *    email is stored as an unverified attempt identifier; no trusted identity
 *    fields are populated.
 *  - Unsupported status values are rejected with 400.
 */

/**
 * Factory that creates the Express route handler for
 * POST /api/security/log-login.
 *
 * @param {object} admin  - The `firebase-admin` module (or a mock).
 * @returns {(req: any, res: any) => Promise<void>} Express middleware.
 */
export const createSecurityLoginLogHandler = (admin) => {
  return async (req, res) => {
    try {
      const { status, email, errorCode, userAgent } = req.body || {};
      if (!status || !email) {
        return res.status(400).json({ error: "status and email are required" });
      }

      let userId = null;
      let name = null;
      let role = null;
      let schoolId = null;
      let schoolName = null;

      if (status === "SUCCESS") {
        const authHeader = (req.headers["authorization"] || "").toString();
        const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
        let decodedToken = null;

        if (!tokenMatch || !tokenMatch[1]) {
          return res.status(401).json({ error: "ID token required for successful login events" });
        }

        try {
          decodedToken = await admin.auth().verifyIdToken(tokenMatch[1]);
          userId = decodedToken.uid;

          const userDoc = await admin.firestore().collection("users").doc(userId).get();
          if (userDoc.exists) {
            const uData = userDoc.data();
            name = uData?.fullName || null;
            role = uData?.role || null;
            if (uData?.schoolId) {
              schoolId = String(uData.schoolId);
              const schoolSnap = await admin
                .firestore()
                .collection("schools")
                .doc(String(uData.schoolId))
                .get();
              if (schoolSnap.exists) schoolName = schoolSnap.data()?.name || null;
            }
          }
        } catch (tokenError) {
          return res.status(401).json({ error: "Invalid or expired ID token" });
        }
      }

      if (status === "FAILED") {
        if (email && String(email).length > 0) {
          userId = String(email).toLowerCase();
        }
      } else if (status !== "SUCCESS") {
        return res.status(400).json({ error: "Unsupported event status" });
      }

      const ipAddress = req.ip || req.socket?.remoteAddress || null;

      const sanitizedErrorCode = errorCode ? String(errorCode).substring(0, 64) : null;
      const sanitizedUserAgent =
        userAgent && typeof userAgent === "string" && userAgent.length <= 500
          ? userAgent
          : null;

      const logRef = admin.firestore().collection("securityLoginLogs").doc();
      await logRef.set({
        userId,
        name,
        email: String(email).toLowerCase(),
        role,
        schoolId,
        schoolName,
        timestamp: Date.now(),
        userAgent: sanitizedUserAgent,
        ipAddress,
        status,
        errorCode: sanitizedErrorCode,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("Failed to log login event", error);
      return res.status(500).json({ error: "Failed to log login event" });
    }
  };
};
