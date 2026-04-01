/**
 * Authentication Configuration
 * 
 * Sets up Passport.js with local strategy (username/password)
 * Handles user serialization/deserialization for sessions
 */

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { User, Settings } from '@shared/schema';

declare global {
  namespace Express {
    interface Request {
      userSettings?: Settings | null;
    }
  }
}

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
passport.serializeUser((user: Express.User, done) => {
  done(null, (user as User).id);
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
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ 
    message: 'Authentication required',
    status: 'error',
    timestamp: new Date().toISOString()
  });
}

/**
 * Middleware that loads and caches user settings on req.userSettings.
 * Use after requireAuth on routes that need sass/persona params to avoid
 * a separate storage.getSettings() call inside the route handler.
 */
export async function withSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user as User;
    if (!user?.id) return next();
    req.userSettings = await storage.getSettings(user.id);
    next();
  } catch (err) {
    next(err);
  }
}
