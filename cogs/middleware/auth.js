const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.header('x-auth-token');

        // Check if no token
        if (!token) {
            return res.status(401).json({ error: 'No token, authorization denied' });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Check if user still exists and is active
            const user = await User.findById(decoded.userId);
            if (!user || !user.isActive) {
                return res.status(401).json({ error: 'User not found or inactive' });
            }

            // Add user info to request
            req.user = {
                userId: decoded.userId,
                username: decoded.username,
                role: decoded.role
            };

            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            return res.status(401).json({ error: 'Token is not valid' });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Admin authorization middleware
const adminAuth = async (req, res, next) => {
    try {
        // First run regular auth
        await auth(req, res, () => {});
        
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        
        next();
    } catch (error) {
        console.error('Admin auth middleware error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Optional auth middleware (doesn't require token)
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.header('x-auth-token');

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.userId);
                
                if (user && user.isActive) {
                    req.user = {
                        userId: decoded.userId,
                        username: decoded.username,
                        role: decoded.role
                    };
                }
            } catch (error) {
                // Token invalid, but continue without user
                req.user = null;
            }
        }

        next();
    } catch (error) {
        console.error('Optional auth middleware error:', error);
        next(); // Continue even if error
    }
};

module.exports = { auth, adminAuth, optionalAuth };
