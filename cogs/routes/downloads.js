const express = require('express');
const { auth, optionalAuth } = require('../middleware/auth');
const Download = require('../models/Download');
const License = require('../models/License');
const User = require('../models/User');

const router = express.Router();

// @route   GET /api/downloads
// @desc    Get available downloads for user
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const category = req.query.category;
        const fileType = req.query.fileType;

        // Get user's active licenses
        const userLicenses = await License.find({
            userId,
            status: 'active',
            expiresAt: { $gt: new Date() }
        });

        const activeLicenseTypes = userLicenses.map(license => license.licenseType);
        const activeProductTypes = userLicenses.map(license => license.productType);

        // Build query for available downloads
        let query = { isActive: true };
        if (category) query.category = category;
        if (fileType) query.fileType = fileType;

        // Get all downloads
        const allDownloads = await Download.find(query).sort({ createdAt: -1 });

        // Filter downloads based on user's licenses and role
        const user = await User.findById(userId);
        const availableDownloads = allDownloads.filter(download => {
            // Check role requirement
            const roleHierarchy = { user: 0, premium: 1, admin: 2 };
            if (roleHierarchy[user.role] < roleHierarchy[download.minimumRole]) {
                return false;
            }

            // Check license requirement
            if (download.requiresLicense) {
                // Check if user has any matching license type
                const hasValidLicense = download.allowedLicenseTypes.some(licenseType =>
                    activeLicenseTypes.includes(licenseType)
                );
                
                // Check if user has license for the product type
                const hasProductLicense = activeProductTypes.includes(download.fileType);
                
                return hasValidLicense || hasProductLicense;
            }

            return true;
        });

        res.json({
            success: true,
            downloads: availableDownloads,
            userLicenses: {
                active: userLicenses.length,
                types: activeLicenseTypes,
                products: activeProductTypes
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/downloads/history
// @desc    Get user's download history
// @access  Private
router.get('/history', auth, async (req, res) => {
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

// @route   POST /api/downloads/:id/download
// @desc    Generate secure download link
// @access  Private
router.post('/:id/download', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const downloadId = req.params.id;

        // Find the download item
        const downloadItem = await Download.findOne({
            _id: downloadId,
            isActive: true
        });

        if (!downloadItem) {
            return res.status(404).json({ error: 'Download not found' });
        }

        // Check if download is still valid
        if (!downloadItem.isDownloadValid()) {
            return res.status(400).json({ error: 'Download link has expired' });
        }

        // Verify user has access
        const user = await User.findById(userId);
        
        // Check role requirement
        const roleHierarchy = { user: 0, premium: 1, admin: 2 };
        if (roleHierarchy[user.role] < roleHierarchy[downloadItem.minimumRole]) {
            return res.status(403).json({ error: 'Insufficient privileges' });
        }

        // Check license requirement
        if (downloadItem.requiresLicense) {
            const userLicenses = await License.find({
                userId,
                status: 'active',
                expiresAt: { $gt: new Date() }
            });

            const activeLicenseTypes = userLicenses.map(license => license.licenseType);
            const activeProductTypes = userLicenses.map(license => license.productType);

            const hasValidLicense = downloadItem.allowedLicenseTypes.some(licenseType =>
                activeLicenseTypes.includes(licenseType)
            );
            
            const hasProductLicense = activeProductTypes.includes(downloadItem.fileType);

            if (!hasValidLicense && !hasProductLicense) {
                return res.status(403).json({ error: 'Valid license required for this download' });
            }
        }

        // Create download record
        const downloadRecord = new Download({
            userId,
            fileName: downloadItem.fileName,
            originalName: downloadItem.originalName,
            fileType: downloadItem.fileType,
            category: downloadItem.category,
            version: downloadItem.version,
            fileSize: downloadItem.fileSize,
            filePath: downloadItem.filePath,
            downloadUrl: downloadItem.downloadUrl,
            downloadedAt: new Date(),
            metadata: downloadItem.metadata
        });

        await downloadRecord.save();

        // Increment download count
        await downloadItem.incrementDownloadCount();

        // Update user stats
        await user.incrementDownloads();

        // Generate secure download URL (in production, this would be a signed URL)
        const secureUrl = `${downloadItem.downloadUrl}?token=${generateDownloadToken(userId, downloadId)}`;

        res.json({
            success: true,
            downloadUrl: secureUrl,
            fileName: downloadItem.originalName,
            fileSize: downloadItem.formattedSize,
            expiresIn: '1 hour',
            message: 'Download link generated successfully'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/downloads/categories
// @desc    Get available download categories
// @access  Private
router.get('/categories', auth, async (req, res) => {
    try {
        const categories = await Download.distinct('category', { isActive: true });
        const fileTypes = await Download.distinct('fileType', { isActive: true });

        res.json({
            success: true,
            categories,
            fileTypes
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/downloads/popular
// @desc    Get popular downloads
// @access  Public
router.get('/popular', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const downloads = await Download.getPopularDownloads(limit);

        res.json({
            success: true,
            downloads: downloads.map(download => ({
                id: download._id,
                name: download.originalName,
                category: download.category,
                fileType: download.fileType,
                downloadCount: download.downloadCount,
                version: download.version,
                description: download.metadata.description
            }))
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/downloads (Admin only)
// @desc    Add new download
// @access  Private (Admin)
router.post('/', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const downloadData = req.body;
        const download = new Download(downloadData);
        await download.save();

        res.status(201).json({
            success: true,
            download,
            message: 'Download added successfully'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT /api/downloads/:id (Admin only)
// @desc    Update download
// @access  Private (Admin)
router.put('/:id', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const download = await Download.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!download) {
            return res.status(404).json({ error: 'Download not found' });
        }

        res.json({
            success: true,
            download,
            message: 'Download updated successfully'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE /api/downloads/:id (Admin only)
// @desc    Delete download
// @access  Private (Admin)
router.delete('/:id', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const download = await Download.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!download) {
            return res.status(404).json({ error: 'Download not found' });
        }

        res.json({
            success: true,
            message: 'Download deactivated successfully'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper function to generate download token
function generateDownloadToken(userId, downloadId) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        { userId, downloadId, type: 'download' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
}

module.exports = router;
