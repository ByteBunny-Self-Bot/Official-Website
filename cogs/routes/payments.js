const express = require('express');
const { auth } = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const License = require('../models/License');

const router = express.Router();

// @route   POST /api/payments/create-intent
// @desc    Create payment intent for license purchase
// @access  Private
router.post('/create-intent', auth, async (req, res) => {
    try {
        const { productType, licenseType, amount, currency = 'usd' } = req.body;
        const userId = req.user.userId;

        // Validate amount (in cents)
        if (!amount || amount < 50) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            metadata: {
                userId,
                productType,
                licenseType,
                source: 'bytebunny-website'
            },
            automatic_payment_methods: {
                enabled: true,
            },
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error('Payment intent creation error:', error);
        res.status(500).json({ error: 'Failed to create payment intent' });
    }
});

// @route   POST /api/payments/confirm
// @desc    Confirm payment and create license
// @access  Private
router.post('/confirm', auth, async (req, res) => {
    try {
        const { paymentIntentId, productType, licenseType } = req.body;
        const userId = req.user.userId;

        // Retrieve payment intent from Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment not completed' });
        }

        // Verify payment belongs to this user
        if (paymentIntent.metadata.userId !== userId) {
            return res.status(403).json({ error: 'Payment verification failed' });
        }

        // Create license
        const productNames = {
            'selfbot': 'ByteBunny Selfbot',
            'admin-tools': 'Admin Tools Suite',
            'moderation': 'Moderation Tools',
            'analytics': 'Analytics Dashboard'
        };

        const license = new License({
            userId,
            productName: productNames[productType] || 'ByteBunny Product',
            productType,
            licenseType,
            status: 'active',
            payment: {
                transactionId: paymentIntent.id,
                amount: paymentIntent.amount / 100, // Convert from cents
                currency: paymentIntent.currency.toUpperCase(),
                method: 'stripe',
                paidAt: new Date()
            },
            metadata: {
                purchaseSource: 'website'
            }
        });

        // Set features based on product type
        license.features = getProductFeatures(productType, licenseType);

        await license.save();

        // Update user stats
        const user = await User.findById(userId);
        await user.addSpent(paymentIntent.amount / 100);

        // Update user subscription if applicable
        if (licenseType !== 'trial') {
            const subscriptionPlan = licenseType === 'lifetime' ? 'lifetime' : 'premium';
            user.subscription.plan = subscriptionPlan;
            user.subscription.status = 'active';
            user.subscription.startDate = new Date();
            if (licenseType !== 'lifetime') {
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + (licenseType === 'monthly' ? 30 : 365));
                user.subscription.endDate = endDate;
            }
            await user.save();
        }

        res.json({
            success: true,
            license: {
                id: license._id,
                licenseKey: license.licenseKey,
                productName: license.productName,
                licenseType: license.licenseType,
                expiresAt: license.expiresAt
            },
            message: 'Payment confirmed and license created successfully'
        });

    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({ error: 'Failed to confirm payment' });
    }
});

// @route   POST /api/payments/webhook
// @desc    Handle Stripe webhooks
// @access  Public
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('Payment succeeded:', paymentIntent.id);
            // Additional processing if needed
            break;
        
        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            console.log('Payment failed:', failedPayment.id);
            // Handle failed payment
            break;

        case 'invoice.payment_succeeded':
            // Handle subscription renewal
            const invoice = event.data.object;
            await handleSubscriptionRenewal(invoice);
            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({received: true});
});

// @route   GET /api/payments/history
// @desc    Get user's payment history
// @access  Private
router.get('/history', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const licenses = await License.find({ 
            userId,
            'payment.transactionId': { $exists: true }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('productName licenseType payment createdAt');

        const total = await License.countDocuments({ 
            userId,
            'payment.transactionId': { $exists: true }
        });

        const payments = licenses.map(license => ({
            id: license._id,
            product: license.productName,
            type: license.licenseType,
            amount: license.payment.amount,
            currency: license.payment.currency,
            method: license.payment.method,
            transactionId: license.payment.transactionId,
            date: license.payment.paidAt || license.createdAt,
            status: 'completed'
        }));

        res.json({
            success: true,
            payments,
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

// @route   GET /api/payments/pricing
// @desc    Get current pricing information
// @access  Public
router.get('/pricing', async (req, res) => {
    try {
        const pricing = {
            selfbot: {
                trial: { price: 0, duration: '7 days' },
                monthly: { price: 9.99, duration: '30 days' },
                yearly: { price: 99.99, duration: '365 days', discount: '17%' },
                lifetime: { price: 299.99, duration: 'lifetime' }
            },
            'admin-tools': {
                monthly: { price: 14.99, duration: '30 days' },
                yearly: { price: 149.99, duration: '365 days', discount: '17%' },
                lifetime: { price: 399.99, duration: 'lifetime' }
            },
            moderation: {
                monthly: { price: 7.99, duration: '30 days' },
                yearly: { price: 79.99, duration: '365 days', discount: '17%' },
                lifetime: { price: 199.99, duration: 'lifetime' }
            },
            analytics: {
                monthly: { price: 12.99, duration: '30 days' },
                yearly: { price: 129.99, duration: '365 days', discount: '17%' },
                lifetime: { price: 349.99, duration: 'lifetime' }
            }
        };

        res.json({
            success: true,
            pricing
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper function to get product features
function getProductFeatures(productType, licenseType) {
    const baseFeatures = {
        selfbot: [
            { name: 'Basic Commands', enabled: true, limit: -1 },
            { name: 'Auto Response', enabled: true, limit: -1 },
            { name: 'Message Management', enabled: true, limit: -1 }
        ],
        'admin-tools': [
            { name: 'User Management', enabled: true, limit: -1 },
            { name: 'Server Statistics', enabled: true, limit: -1 },
            { name: 'Bulk Operations', enabled: true, limit: -1 }
        ],
        moderation: [
            { name: 'Auto Moderation', enabled: true, limit: -1 },
            { name: 'Warning System', enabled: true, limit: -1 },
            { name: 'Logging', enabled: true, limit: -1 }
        ],
        analytics: [
            { name: 'Activity Tracking', enabled: true, limit: -1 },
            { name: 'Custom Reports', enabled: true, limit: -1 },
            { name: 'Data Export', enabled: true, limit: -1 }
        ]
    };

    let features = baseFeatures[productType] || [];

    // Add premium features for non-trial licenses
    if (licenseType !== 'trial') {
        features.push(
            { name: 'Premium Support', enabled: true, limit: -1 },
            { name: 'Priority Updates', enabled: true, limit: -1 }
        );
    }

    // Add unlimited features for lifetime licenses
    if (licenseType === 'lifetime') {
        features.push(
            { name: 'Unlimited Usage', enabled: true, limit: -1 },
            { name: 'All Future Updates', enabled: true, limit: -1 }
        );
    }

    return features;
}

// Helper function to handle subscription renewal
async function handleSubscriptionRenewal(invoice) {
    try {
        const customerId = invoice.customer;
        const subscriptionId = invoice.subscription;

        // Find user by Stripe customer ID (you'd need to store this in user model)
        // For now, we'll skip this implementation
        console.log('Subscription renewal for customer:', customerId);

    } catch (error) {
        console.error('Subscription renewal error:', error);
    }
}

module.exports = router;
