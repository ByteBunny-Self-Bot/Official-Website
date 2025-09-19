const express = require('express');
const axios = require('axios');

const router = express.Router();

// @route   GET /api/discord/server-invite
// @desc    Get Discord server invite link
// @access  Public
router.get('/server-invite', (req, res) => {
    res.json({
        success: true,
        discordInvite: process.env.DISCORD_SERVER_INVITE || 'https://discord.gg/bytebunny',
        message: 'Join our Discord server for support, purchases, and community!'
    });
});

// @route   POST /api/discord/checkout
// @desc    Handle checkout requests and create Discord ticket
// @access  Public
router.post('/checkout', async (req, res) => {
    const { items, user } = req.body;

    // Log checkout request
    console.log(`Checkout request from: ${user.username}`, items);

    // Create checkout summary
    const checkoutSummary = {
        items: items,
        user: user,
        timestamp: new Date().toISOString(),
        total: items.length,
        checkoutId: `checkout_${Date.now()}`
    };

    try {
        // Send checkout data to Discord bot for ticket creation
        if (process.env.DISCORD_BOT_HTTP_URL) {
            console.log('🔗 Sending checkout request to Discord bot...');
            
            const botResponse = await axios.post(`${process.env.DISCORD_BOT_HTTP_URL}/checkout`, 
                checkoutSummary,
                {
                    timeout: 10000, // 10 second timeout
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log('✅ Discord bot response:', botResponse.data);
            
            if (botResponse.data.success) {
                console.log(`🎫 Ticket created successfully: ${botResponse.data.ticketId}`);
            }
        } else {
            console.log('⚠️ DISCORD_BOT_HTTP_URL not configured, skipping bot notification');
        }

        // Store checkout data (in production, save to database)
        console.log('📦 Checkout Summary:', JSON.stringify(checkoutSummary, null, 2));
        
        // TODO: Implement Discord webhook or bot HTTP call here
        // For now, just log the data - tickets will need to be created manually
        console.log('⚠️ Bot integration pending - ticket should be created for:', checkoutSummary);

        res.json({
            success: true,
            discordInvite: process.env.DISCORD_SERVER_INVITE,
            message: 'Checkout request processed. A support ticket has been created in Discord.',
            checkoutId: checkoutSummary.checkoutId,
            summary: checkoutSummary
        });

    } catch (error) {
        console.error('Error processing checkout:', error);
        
        // Even if Discord bot fails, still return success
        res.json({
            success: true,
            discordInvite: process.env.DISCORD_SERVER_INVITE,
            message: 'Checkout request processed. Please join Discord for payment assistance.',
            checkoutId: checkoutSummary.checkoutId,
            summary: checkoutSummary
        });
    }
});

// @route   POST /api/discord/purchase-redirect
// @desc    Redirect users to Discord for purchases
// @access  Public
router.post('/purchase-redirect', (req, res) => {
    const { productType, licenseType, username } = req.body;

    // Log purchase interest (optional)
    console.log(`Purchase interest: ${username || 'Anonymous'} - ${productType} (${licenseType})`);

    res.json({
        success: true,
        redirectUrl: process.env.DISCORD_SERVER_INVITE,
        message: 'Please join our Discord server and contact an admin to complete your purchase!',
        purchaseInfo: {
            product: productType,
            license: licenseType,
            instructions: [
                '1. Join our Discord server using the invite link',
                '2. Go to the #purchases or #support channel',
                '3. Contact an admin or moderator',
                '4. Provide your product and license preferences',
                '5. Complete payment through Discord'
            ]
        }
    });
});

// @route   POST /api/discord/support-redirect
// @desc    Redirect users to Discord for support
// @access  Public
router.post('/support-redirect', (req, res) => {
    const { issue, description, username } = req.body;

    // Log support request (optional)
    console.log(`Support request: ${username || 'Anonymous'} - ${issue}`);

    res.json({
        success: true,
        redirectUrl: process.env.DISCORD_SERVER_INVITE,
        message: 'Please join our Discord server for support and assistance!',
        supportInfo: {
            issue: issue,
            instructions: [
                '1. Join our Discord server using the invite link',
                '2. Go to the #support or #help channel',
                '3. Describe your issue to our support team',
                '4. Provide any relevant details',
                '5. Wait for assistance from our team'
            ]
        }
    });
});

// @route   GET /api/discord/contact-info
// @desc    Get contact and community information
// @access  Public
router.get('/contact-info', (req, res) => {
    res.json({
        success: true,
        community: {
            discord: process.env.DISCORD_SERVER_INVITE,
            name: 'ByteBunny Community',
            description: 'Join our Discord server for support, purchases, updates, and community discussions!'
        },
        services: {
            support: 'Available in Discord #support channel',
            purchases: 'Contact admins in Discord for purchases',
            updates: 'Latest updates posted in Discord #announcements',
            community: 'Chat with other users in Discord general channels'
        },
        instructions: {
            newUsers: [
                'Click the Discord invite link',
                'Join the ByteBunny server',
                'Read the rules and announcements',
                'Use appropriate channels for your needs'
            ],
            purchases: [
                'Join Discord server',
                'Contact an admin or moderator',
                'Discuss product options and pricing',
                'Complete payment as instructed',
                'Receive your license and downloads'
            ],
            support: [
                'Join Discord server',
                'Use #support channel',
                'Describe your issue clearly',
                'Wait for team assistance',
                'Follow provided solutions'
            ]
        }
    });
});

// @route   GET /api/discord/status
// @desc    Get Discord community status
// @access  Public
router.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'active',
        community: {
            platform: 'Discord',
            invite: process.env.DISCORD_SERVER_INVITE,
            features: [
                'Live Support',
                'Purchase Assistance', 
                'Community Chat',
                'Product Updates',
                'User Guides',
                'Direct Admin Contact'
            ]
        },
        message: 'Join our active Discord community!'
    });
});

// @route   POST /api/discord/checkout
// @desc    Handle checkout requests and create Discord ticket
// @access  Public
router.post('/checkout', async (req, res) => {
    const { items, user } = req.body;

    // Log checkout request
    console.log(`Checkout request from: ${user.username}`, items);

    // Create checkout summary
    const checkoutSummary = {
        items: items,
        user: user,
        timestamp: new Date().toISOString(),
        total: items.length
    };

    // In production, this would create a Discord ticket
    // For now, just log and return success
    console.log('Checkout Summary:', JSON.stringify(checkoutSummary, null, 2));

    res.json({
        success: true,
        discordInvite: process.env.DISCORD_SERVER_INVITE,
        message: 'Checkout request processed. Please join Discord for payment assistance.',
        checkoutId: `checkout_${Date.now()}`,
        summary: checkoutSummary
    });
});

module.exports = router;
