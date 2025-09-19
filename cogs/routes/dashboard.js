const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const User = require('../models/User');
const License = require('../models/License');
const Download = require('../models/Download');

const router = express.Router();

// @route   GET /api/dashboard/stats
// @desc    Get user dashboard statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get user data
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get license information
        const licenses = await License.find({ userId }).sort({ createdAt: -1 });
        const activeLicenses = licenses.filter(license => 
            license.status === 'active' && 
            new Date(license.expiresAt) > new Date()
        );

        // Get download history
        const downloads = await Download.find({ userId })
            .sort({ downloadedAt: -1 })
            .limit(10);

        // Calculate statistics
        const stats = {
            totalLicenses: licenses.length,
            activeLicenses: activeLicenses.length,
            expiredLicenses: licenses.filter(license => 
                license.status === 'expired' || 
                new Date(license.expiresAt) <= new Date()
            ).length,
            totalDownloads: downloads.length,
            accountCreated: user.createdAt,
            lastLogin: user.lastLogin,
            membershipStatus: activeLicenses.length > 0 ? 'Premium' : 'Free'
        };

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                discordId: user.discordId,
                role: user.role
            },
            stats,
            recentDownloads: downloads.slice(0, 5)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/dashboard/licenses
// @desc    Get user licenses
// @access  Private
router.get('/licenses', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const licenses = await License.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await License.countDocuments({ userId });

        const licensesWithStatus = licenses.map(license => ({
            ...license.toObject(),
            isActive: license.status === 'active' && new Date(license.expiresAt) > new Date(),
            daysRemaining: Math.max(0, Math.ceil((new Date(license.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)))
        }));

        res.json({
            success: true,
            licenses: licensesWithStatus,
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

// @route   GET /api/dashboard/downloads
// @desc    Get user download history
// @access  Private
router.get('/downloads', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const downloads = await Download.find({ userId })
            .sort({ downloadedAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Download.countDocuments({ userId });

        res.json({
            success: true,
            downloads,
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

// @route   GET /api/dashboard/activity
// @desc    Get user activity feed
// @access  Private
router.get('/activity', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit) || 20;

        // Combine licenses and downloads for activity feed
        const [licenses, downloads] = await Promise.all([
            License.find({ userId }).sort({ createdAt: -1 }).limit(limit),
            Download.find({ userId }).sort({ downloadedAt: -1 }).limit(limit)
        ]);

        // Create activity items
        const activities = [];

        licenses.forEach(license => {
            activities.push({
                type: 'license',
                action: 'purchased',
                item: license.productName,
                date: license.createdAt,
                details: {
                    licenseKey: license.licenseKey,
                    status: license.status,
                    expiresAt: license.expiresAt
                }
            });
        });

        downloads.forEach(download => {
            activities.push({
                type: 'download',
                action: 'downloaded',
                item: download.fileName,
                date: download.downloadedAt,
                details: {
                    fileSize: download.fileSize,
                    version: download.version
                }
            });
        });

        // Sort by date and limit
        activities.sort((a, b) => new Date(b.date) - new Date(a.date));
        const recentActivity = activities.slice(0, limit);

        res.json({
            success: true,
            activities: recentActivity
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/dashboard/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { username, email, discordId } = req.body;

        // Check if new username/email/discordId already exists
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
        updateData.updatedAt = new Date();

        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        res.json({
            success: true,
            user,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/dashboard/notifications
// @desc    Get user notifications
// @access  Private
router.get('/notifications', auth, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Check for expiring licenses
        const expiringLicenses = await License.find({
            userId,
            status: 'active',
            expiresAt: {
                $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                $gt: new Date()
            }
        });

        const notifications = [];

        // Add expiring license notifications
        expiringLicenses.forEach(license => {
            const daysRemaining = Math.ceil((new Date(license.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
            notifications.push({
                type: 'warning',
                title: 'License Expiring Soon',
                message: `Your ${license.productName} license expires in ${daysRemaining} days`,
                date: new Date(),
                action: {
                    text: 'Renew License',
                    link: '/dashboard/licenses'
                }
            });
        });

        // Add welcome notification for new users
        const user = await User.findById(userId);
        const daysSinceJoined = Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24));
        
        if (daysSinceJoined <= 1) {
            notifications.push({
                type: 'info',
                title: 'Welcome to ByteBunny!',
                message: 'Thank you for joining our community. Check out our programs and features.',
                date: user.createdAt,
                action: {
                    text: 'Browse Programs',
                    link: '/programs'
                }
            });
        }

        res.json({
            success: true,
            notifications
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
