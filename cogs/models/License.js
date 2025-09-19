const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const licenseSchema = new mongoose.Schema({
    licenseKey: {
        type: String,
        required: true,
        unique: true,
        default: () => `BB-${uuidv4().substring(0, 8).toUpperCase()}-${uuidv4().substring(0, 8).toUpperCase()}`
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    productName: {
        type: String,
        required: true,
        enum: [
            'ByteBunny Basic',
            'ByteBunny Premium',
            'ByteBunny Enterprise',
            'Admin Tools',
            'Moderation Suite',
            'Analytics Dashboard'
        ]
    },
    productType: {
        type: String,
        required: true,
        enum: ['selfbot', 'admin-tools', 'moderation', 'analytics']
    },
    licenseType: {
        type: String,
        required: true,
        enum: ['trial', 'monthly', 'yearly', 'lifetime'],
        default: 'monthly'
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'revoked', 'suspended'],
        default: 'active'
    },
    activatedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    },
    lastUsed: {
        type: Date,
        default: Date.now
    },
    usageCount: {
        type: Number,
        default: 0
    },
    maxUsage: {
        type: Number,
        default: -1 // -1 means unlimited
    },
    features: [{
        name: String,
        enabled: { type: Boolean, default: true },
        limit: { type: Number, default: -1 } // -1 means unlimited
    }],
    restrictions: {
        ipWhitelist: [String],
        discordServerIds: [String],
        maxConcurrentSessions: { type: Number, default: 1 }
    },
    payment: {
        transactionId: String,
        amount: Number,
        currency: { type: String, default: 'USD' },
        method: String, // 'stripe', 'paypal', 'crypto'
        paidAt: Date
    },
    metadata: {
        purchaseSource: String, // 'website', 'discord', 'referral'
        referralCode: String,
        notes: String,
        tags: [String]
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for checking if license is currently valid
licenseSchema.virtual('isValid').get(function() {
    return this.status === 'active' && new Date() < this.expiresAt;
});

// Virtual for days remaining
licenseSchema.virtual('daysRemaining').get(function() {
    if (this.status !== 'active') return 0;
    const now = new Date();
    const expiry = new Date(this.expiresAt);
    return Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
});

// Virtual for usage percentage
licenseSchema.virtual('usagePercentage').get(function() {
    if (this.maxUsage === -1) return 0; // Unlimited
    return Math.min(100, (this.usageCount / this.maxUsage) * 100);
});

// Pre-save middleware to set expiration date
licenseSchema.pre('save', function(next) {
    if (this.isNew && !this.expiresAt) {
        const now = new Date();
        switch (this.licenseType) {
            case 'trial':
                this.expiresAt = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days
                break;
            case 'monthly':
                this.expiresAt = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
                break;
            case 'yearly':
                this.expiresAt = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)); // 365 days
                break;
            case 'lifetime':
                this.expiresAt = new Date('2099-12-31'); // Far future date
                break;
        }
    }
    next();
});

// Instance methods
licenseSchema.methods.activate = function() {
    this.status = 'active';
    this.activatedAt = new Date();
    return this.save();
};

licenseSchema.methods.revoke = function(reason = '') {
    this.status = 'revoked';
    this.metadata.notes = `Revoked: ${reason}`;
    return this.save();
};

licenseSchema.methods.extend = function(days) {
    this.expiresAt = new Date(this.expiresAt.getTime() + (days * 24 * 60 * 60 * 1000));
    return this.save();
};

licenseSchema.methods.recordUsage = function() {
    this.usageCount += 1;
    this.lastUsed = new Date();
    return this.save();
};

licenseSchema.methods.hasFeature = function(featureName) {
    const feature = this.features.find(f => f.name === featureName);
    return feature && feature.enabled;
};

licenseSchema.methods.getFeatureLimit = function(featureName) {
    const feature = this.features.find(f => f.name === featureName);
    return feature ? feature.limit : 0;
};

// Static methods
licenseSchema.statics.generateKey = function() {
    return `BB-${uuidv4().substring(0, 8).toUpperCase()}-${uuidv4().substring(0, 8).toUpperCase()}`;
};

licenseSchema.statics.findValid = function(licenseKey) {
    return this.findOne({
        licenseKey,
        status: 'active',
        expiresAt: { $gt: new Date() }
    });
};

licenseSchema.statics.findExpiring = function(days = 7) {
    const futureDate = new Date(Date.now() + (days * 24 * 60 * 60 * 1000));
    return this.find({
        status: 'active',
        expiresAt: { $lte: futureDate, $gt: new Date() }
    }).populate('userId', 'username email');
};

// Indexes for performance
licenseSchema.index({ licenseKey: 1 });
licenseSchema.index({ userId: 1, status: 1 });
licenseSchema.index({ expiresAt: 1, status: 1 });
licenseSchema.index({ productType: 1, licenseType: 1 });

module.exports = mongoose.model('License', licenseSchema);
