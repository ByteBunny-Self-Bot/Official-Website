const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
        select: false
    },
    discordId: {
        type: String,
        required: true,
        unique: true
    },
    role: {
        type: String,
        enum: ['user', 'premium', 'admin', 'moderator'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    avatar: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        maxlength: 500,
        default: ''
    },
    preferences: {
        notifications: {
            email: { type: Boolean, default: true },
            discord: { type: Boolean, default: true },
            browser: { type: Boolean, default: true }
        },
        theme: {
            type: String,
            enum: ['dark', 'light', 'auto'],
            default: 'dark'
        },
        language: {
            type: String,
            default: 'en'
        }
    },
    stats: {
        totalDownloads: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        joinedAt: { type: Date, default: Date.now },
        lastLogin: { type: Date, default: Date.now },
        loginCount: { type: Number, default: 0 }
    },
    security: {
        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorSecret: { type: String, select: false },
        passwordResetToken: { type: String, select: false },
        passwordResetExpires: { type: Date, select: false },
        emailVerificationToken: { type: String, select: false },
        lastPasswordChange: { type: Date, default: Date.now }
    },
    subscription: {
        plan: {
            type: String,
            enum: ['free', 'basic', 'premium', 'lifetime'],
            default: 'free'
        },
        status: {
            type: String,
            enum: ['active', 'cancelled', 'expired', 'pending'],
            default: 'active'
        },
        startDate: { type: Date },
        endDate: { type: Date },
        autoRenew: { type: Boolean, default: false }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for user's full profile
userSchema.virtual('profile').get(function() {
    return {
        id: this._id,
        username: this.username,
        email: this.email,
        discordId: this.discordId,
        role: this.role,
        avatar: this.avatar,
        bio: this.bio,
        stats: this.stats,
        subscription: this.subscription,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
});

// Pre-save middleware to update login stats
userSchema.pre('save', function(next) {
    if (this.isModified('stats.lastLogin')) {
        this.stats.loginCount += 1;
    }
    next();
});

// Instance methods
userSchema.methods.toAuthJSON = function() {
    return {
        id: this._id,
        username: this.username,
        email: this.email,
        role: this.role,
        discordId: this.discordId,
        avatar: this.avatar,
        subscription: this.subscription
    };
};

userSchema.methods.hasValidSubscription = function() {
    return this.subscription.status === 'active' && 
           (!this.subscription.endDate || this.subscription.endDate > new Date());
};

userSchema.methods.incrementDownloads = function() {
    this.stats.totalDownloads += 1;
    return this.save();
};

userSchema.methods.addSpent = function(amount) {
    this.stats.totalSpent += amount;
    return this.save();
};

// Indexes for performance
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ discordId: 1 });
userSchema.index({ 'subscription.status': 1, 'subscription.endDate': 1 });

module.exports = mongoose.model('User', userSchema);
