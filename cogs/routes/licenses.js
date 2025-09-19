const express = require('express');
const { auth } = require('../middleware/auth');
const License = require('../models/License');
const User = require('../models/User');

const router = express.Router();

// @route   GET /api/licenses
// @desc    Get all licenses for authenticated user
// @access  Private
router.get('/', auth, async (req, res) => {
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

        res.json({
            success: true,
            licenses,
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

// @route   GET /api/licenses/:id
// @desc    Get specific license
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const license = await License.findOne({
            _id: req.params.id,
            userId: req.user.userId
        });

        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }

        res.json({
            success: true,
            license
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/licenses/verify
// @desc    Verify a license key
// @access  Public
router.post('/verify', async (req, res) => {
    try {
        const { licenseKey } = req.body;

        if (!licenseKey) {
            return res.status(400).json({ error: 'License key is required' });
        }

        const license = await License.findOne({ licenseKey })
            .populate('userId', 'username discordId');

        if (!license) {
            return res.status(404).json({ 
                valid: false,
                error: 'License key not found' 
            });
        }

        // Check if license is valid
        const isValid = license.status === 'active' && 
                       new Date() < new Date(license.expiresAt);

        if (!isValid) {
            return res.json({
                valid: false,
                error: license.status === 'active' ? 'License expired' : `License ${license.status}`,
                license: {
                    key: license.licenseKey,
                    status: license.status,
                    expiresAt: license.expiresAt
                }
            });
        }

        // Record usage
        await license.recordUsage();

        res.json({
            valid: true,
            license: {
                key: license.licenseKey,
                productName: license.productName,
                productType: license.productType,
                licenseType: license.licenseType,
                status: license.status,
                expiresAt: license.expiresAt,
                features: license.features,
                restrictions: license.restrictions,
                user: {
                    username: license.userId.username,
                    discordId: license.userId.discordId
                }
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/licenses/activate
// @desc    Activate a license key
// @access  Private
router.post('/activate', auth, async (req, res) => {
    try {
        const { licenseKey } = req.body;
        const userId = req.user.userId;

        if (!licenseKey) {
            return res.status(400).json({ error: 'License key is required' });
        }

        const license = await License.findOne({ licenseKey });

        if (!license) {
            return res.status(404).json({ error: 'Invalid license key' });
        }

        if (license.userId.toString() !== userId) {
            return res.status(403).json({ error: 'License belongs to another user' });
        }

        if (license.status === 'active') {
            return res.status(400).json({ error: 'License is already active' });
        }

        // Activate license
        await license.activate();

        res.json({
            success: true,
            message: 'License activated successfully',
            license
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/licenses/:id/extend
// @desc    Extend license duration (Admin only)
// @access  Private (Admin)
router.put('/:id/extend', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { days } = req.body;
        
        if (!days || days <= 0) {
            return res.status(400).json({ error: 'Valid number of days required' });
        }

        const license = await License.findById(req.params.id);

        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }

        await license.extend(days);

        res.json({
            success: true,
            message: `License extended by ${days} days`,
            license
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/licenses/:id/revoke
// @desc    Revoke a license (Admin only)
// @access  Private (Admin)
router.put('/:id/revoke', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { reason } = req.body;
        const license = await License.findById(req.params.id);

        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }

        await license.revoke(reason);

        res.json({
            success: true,
            message: 'License revoked successfully',
            license
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/licenses/expiring
// @desc    Get expiring licenses (Admin only)
// @access  Private (Admin)
router.get('/admin/expiring', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const days = parseInt(req.query.days) || 7;
        const expiringLicenses = await License.findExpiring(days);

        res.json({
            success: true,
            licenses: expiringLicenses,
            count: expiringLicenses.length
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
