const mongoose = require('mongoose');

const downloadSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        required: true,
        enum: ['selfbot', 'admin-tools', 'plugin', 'update', 'addon']
    },
    category: {
        type: String,
        required: true,
        enum: ['bytebunny-core', 'admin-suite', 'moderation-tools', 'plugins', 'themes']
    },
    version: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        required: true // Size in bytes
    },
    filePath: {
        type: String,
        required: true
    },
    downloadUrl: {
        type: String,
        required: true
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    requiresLicense: {
        type: Boolean,
        default: true
    },
    allowedLicenseTypes: [{
        type: String,
        enum: ['trial', 'monthly', 'yearly', 'lifetime']
    }],
    minimumRole: {
        type: String,
        enum: ['user', 'premium', 'admin'],
        default: 'user'
    },
    downloadedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date // Optional expiration for download link
    },
    metadata: {
        description: String,
        changelog: String,
        requirements: [String],
        compatibility: [String],
        tags: [String]
    }
}, {
    timestamps: true
});

// Virtual for formatted file size
downloadSchema.virtual('formattedSize').get(function() {
    const bytes = this.fileSize;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Instance methods
downloadSchema.methods.incrementDownloadCount = function() {
    this.downloadCount += 1;
    return this.save();
};

downloadSchema.methods.isDownloadValid = function() {
    if (!this.isActive) return false;
    if (this.expiresAt && new Date() > this.expiresAt) return false;
    return true;
};

// Static methods
downloadSchema.statics.findByCategory = function(category, isActive = true) {
    return this.find({ category, isActive }).sort({ createdAt: -1 });
};

downloadSchema.statics.findByType = function(fileType, isActive = true) {
    return this.find({ fileType, isActive }).sort({ createdAt: -1 });
};

downloadSchema.statics.getPopularDownloads = function(limit = 10) {
    return this.find({ isActive: true })
        .sort({ downloadCount: -1 })
        .limit(limit);
};

// Indexes
downloadSchema.index({ userId: 1, downloadedAt: -1 });
downloadSchema.index({ fileType: 1, isActive: 1 });
downloadSchema.index({ category: 1, isActive: 1 });
downloadSchema.index({ downloadCount: -1 });

module.exports = mongoose.model('Download', downloadSchema);
