/*
    auth.js

    Express middleware to extract and validate the user's UID.
    Allows Threadline ownership scoping. Resolves the identifier via the x-user-uid header.
    In a production cloud deployment, this middleware should verify a Firebase ID token.
*/

module.exports = (req, res, next) => {
    const uid = req.headers["x-user-uid"] || (req.query && req.query.uid) || (req.body && req.body.uid);

    if (!uid) {
        return res.status(401).json({
            status: "error",
            message: "Authentication required. Missing user identity header (x-user-uid)."
        });
    }

    // Attach user ID to the request object for downstream controllers
    req.uid = uid;

    /*
      Production Integration Note:
      To upgrade this to secure cryptographic authentication:
      
      const admin = require("firebase-admin");
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
          const idToken = authHeader.split("Bearer ")[1];
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          req.uid = decodedToken.uid;
      } else {
          return res.status(401).json({ status: "error", message: "Unauthorized token" });
      }
    */

    next();
};
