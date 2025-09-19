const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const User = require('../models/User');
const License = require('../models/License');

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password -security');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            user: user.profile
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { username, email, discordId, bio, avatar } = req.body;

        // Check if new values are already taken by other users
        if (username || email || discordId) {
            const existingUser = await User.findOne({
                _id: { $ne: userId },
                $or: [
                    username && { username },
                    email && { email },
                    discordId && { discordId }
                ].filter(Boolean)
            });

            if (existingUser) {
                return res.status(400).json({ 
                    error: 'Username, email, or Discord ID already taken' 
                });
            }
        }

        // Update user
        const updateData = {};
        if (username) updateData.username = username;
        if (email) updateData.email = email;
        if (discordId) updateData.discordId = discordId;
        if (bio !== undefined) updateData.bio = bio;
        if (avatar) updateData.avatar = avatar;

        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        ).select('-password -security');

        res.json({
            success: true,
            user: user.profile,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error(error);
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Username, email, or Discord ID already exists' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/users/preferences
// @desc    Update user preferences
// @access  Private
router.put('/preferences', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { notifications, theme, language } = req.body;

        const updateData = {};
        if (notifications) updateData['preferences.notifications'] = notifications;
        if (theme) updateData['preferences.theme'] = theme;
        if (language) updateData['preferences.language'] = language;

        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        ).select('preferences');

        res.json({
            success: true,
            preferences: user.preferences,
            message: 'Preferences updated successfully'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const [user, licenses] = await Promise.all([
            User.findById(userId).select('stats subscription createdAt'),
            License.find({ userId })
        ]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const activeLicenses = licenses.filter(license => 
            license.status === 'active' && new Date() < new Date(license.expiresAt)
        );

        const stats = {
            ...user.stats.toObject(),
            activeLicenses: activeLicenses.length,
            totalLicenses: licenses.length,
            subscription: user.subscription,
            memberSince: user.createdAt,
            hasActiveSubscription: user.hasValidSubscription()
        };

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE /api/users/account
// @desc    Delete user account
// @access  Private
router.delete('/account', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { password, confirmation } = req.body;

        if (confirmation !== 'DELETE') {
            return res.status(400).json({ 
                error: 'Please type DELETE to confirm account deletion' 
            });
        }

        // Verify password
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        // Soft delete - deactivate instead of removing
        await User.findByIdAndUpdate(userId, {
            isActive: false,
            email: `deleted_${userId}@deleted.com`,
            username: `deleted_${userId}`,
            discordId: `deleted_${userId}`
        });

        // Revoke all licenses
        await License.updateMany(
            { userId },
            { status: 'revoked', 'metadata.notes': 'Account deleted' }
        );

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/users (Admin only)
// @desc    Get all users with pagination
// @access  Private (Admin)
router.get('/', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const role = req.query.role || '';
        const isActive = req.query.isActive;

        // Build query
        const query = {};
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { discordId: { $regex: search, $options: 'i' } }
            ];
        }
        if (role) query.role = role;
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const [users, total] = await Promise.all([
            User.find(query)
                .select('-password -security')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            User.countDocuments(query)
        ]);

        res.json({
            success: true,
            users,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/users/:id/role (Admin only)
// @desc    Update user role
// @access  Private (Admin)
router.put('/:id/role', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { role } = req.body;
        const validRoles = ['user', 'premium', 'admin', 'moderator'];

        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true }
        ).select('-password -security');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            user,
            message: `User role updated to ${role}`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/users/:id/status (Admin only)
// @desc    Update user status (active/inactive)
// @access  Private (Admin)
router.put('/:id/status', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { isActive } = req.body;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { new: true }
        ).select('-password -security');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            user,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
