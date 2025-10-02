/**
 * Authentication Configuration
 * 
 * Sets up Passport.js with local strategy (username/password)
 * Handles user serialization/deserialization for sessions
 */

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import { storage } from './storage';

/**
 * Configure Passport local strategy for username/password authentication
 */
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return done(null, false, { message: 'Incorrect username or password' });
      }

      const isValid = await bcrypt.compare(password, user.password);
      
      if (!isValid) {
        return done(null, false, { message: 'Incorrect username or password' });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  })
);

/**
 * Serialize user to session (store user ID)
 */
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

/**
 * Deserialize user from session (retrieve full user object)
 */
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;

/**
 * Middleware to ensure user is authenticated
 * Returns 401 if not authenticated
 */
export function requireAuth(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ 
    message: 'Authentication required',
    status: 'error',
    timestamp: new Date().toISOString()
  });
}
