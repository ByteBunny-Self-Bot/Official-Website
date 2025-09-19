const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const axios = require('axios');
const express = require('express');
require('dotenv').config();

class ByteBunnyBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.activeTickets = new Map();
        this.ticketCounter = 1;
        
        // Initialize HTTP server for receiving backend requests
        this.app = express();
        this.setupHttpServer();
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.client.login(process.env.DISCORD_BOT_TOKEN);
    }

    setupHttpServer() {
        this.app.use(express.json());
        
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'online', 
                bot: this.client.user?.tag || 'connecting...',
                activeTickets: this.activeTickets.size 
            });
        });

        // Checkout endpoint for backend to send requests
        this.app.post('/checkout', async (req, res) => {
            try {
                console.log('📦 Received checkout request:', req.body);
                
                const result = await this.handleWebhookCheckout(req.body);
                
                res.json({
                    success: true,
                    message: 'Ticket created successfully',
                    ticketId: result.ticketId,
                    channelId: result.channelId
                });
            } catch (error) {
                console.error('❌ Error handling checkout:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to create ticket',
                    message: error.message
                });
            }
        });

        // Start HTTP server
        const port = process.env.BOT_HTTP_PORT || 3001;
        this.app.listen(port, () => {
            console.log(`🌐 Bot HTTP server running on port ${port}`);
        });
    }

    setupEventListeners() {
        this.client.once('ready', () => {
            console.log(`✅ ByteBunny Bot is online as ${this.client.user.tag}!`);
            this.client.user.setActivity('Managing ByteBunny purchases', { type: 'WATCHING' });
        });

        this.client.on('messageCreate', (message) => this.handleMessage(message));
        this.client.on('interactionCreate', (interaction) => this.handleInteraction(interaction));
    }

    async handleMessage(message) {
        if (message.author.bot) return;

        const prefix = process.env.BOT_PREFIX || '!';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        switch (command) {
            case 'help':
                await this.sendHelpEmbed(message);
                break;
            case 'ticket':
                await this.createManualTicket(message, args);
                break;
            case 'close':
                await this.closeTicket(message);
                break;
            case 'status':
                await this.showBotStatus(message);
                break;
        }
    }

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return;

        const { customId, user, channel } = interaction;

        switch (customId) {
            case 'close_ticket':
                await this.closeTicketInteraction(interaction);
                break;
            case 'confirm_purchase':
                await this.confirmPurchase(interaction);
                break;
            case 'cancel_purchase':
                await this.cancelPurchase(interaction);
                break;
        }
    }

    async createCheckoutTicket(checkoutData) {
        try {
            const guild = this.client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
            if (!guild) throw new Error('Guild not found');

            const ticketCategory = guild.channels.cache.get(process.env.TICKET_CATEGORY_ID);
            const ticketNumber = this.ticketCounter++;
            const channelName = `checkout-${ticketNumber}`;

            // Create ticket channel
            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: ticketCategory?.id,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: process.env.STAFF_ROLE_ID,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageMessages
                        ]
                    }
                ]
            });

            // Create checkout embed
            const embed = new EmbedBuilder()
                .setTitle('🛒 New Purchase Request')
                .setDescription('A customer has submitted a purchase request from the website.')
                .setColor(process.env.EMBED_COLOR || '#ff4757')
                .addFields(
                    {
                        name: '👤 Customer Information',
                        value: `**Username:** ${checkoutData.user.username}\n**Timestamp:** ${new Date(checkoutData.user.timestamp).toLocaleString()}`,
                        inline: false
                    },
                    {
                        name: '🛍️ Items Requested',
                        value: checkoutData.items.map((item, index) => 
                            `**${index + 1}.** ${item.name}\n   ↳ Duration: ${item.duration}\n   ↳ Price: ${item.price}`
                        ).join('\n\n') || 'No items found',
                        inline: false
                    },
                    {
                        name: '📊 Order Summary',
                        value: `**Total Items:** ${checkoutData.items.length}\n**Checkout ID:** ${checkoutData.checkoutId || 'N/A'}`,
                        inline: false
                    }
                )
                .setFooter({ 
                    text: 'ByteBunny Purchase System',
                    iconURL: this.client.user.displayAvatarURL()
                })
                .setTimestamp();

            // Create action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_purchase')
                        .setLabel('✅ Process Order')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('cancel_purchase')
                        .setLabel('❌ Cancel Order')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('🔒 Close Ticket')
                        .setStyle(ButtonStyle.Secondary)
                );

            // Send initial message
            const ticketMessage = await ticketChannel.send({
                content: `<@&${process.env.STAFF_ROLE_ID}> New purchase request!`,
                embeds: [embed],
                components: [actionRow]
            });

            // Store ticket data
            this.activeTickets.set(ticketChannel.id, {
                checkoutData,
                messageId: ticketMessage.id,
                createdAt: new Date(),
                status: 'pending'
            });

            // Log ticket creation
            await this.logActivity(`🎫 Checkout ticket created: ${channelName}`, {
                checkoutData,
                channelId: ticketChannel.id
            });

            return {
                success: true,
                channelId: ticketChannel.id,
                channelName: channelName,
                ticketNumber: ticketNumber
            };

        } catch (error) {
            console.error('Error creating checkout ticket:', error);
            await this.logActivity(`❌ Failed to create checkout ticket: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async createManualTicket(message, args) {
        const reason = args.join(' ') || 'General support';
        
        try {
            const guild = message.guild;
            const ticketCategory = guild.channels.cache.get(process.env.TICKET_CATEGORY_ID);
            const ticketNumber = this.ticketCounter++;
            const channelName = `ticket-${message.author.username.toLowerCase()}-${ticketNumber}`;

            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: ticketCategory?.id,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: message.author.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages
                        ]
                    },
                    {
                        id: process.env.STAFF_ROLE_ID,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageMessages
                        ]
                    }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle('🎫 Support Ticket Created')
                .setDescription(`**Reason:** ${reason}`)
                .setColor(process.env.EMBED_COLOR || '#ff4757')
                .addFields(
                    {
                        name: '👤 User',
                        value: `${message.author} (${message.author.tag})`,
                        inline: true
                    },
                    {
                        name: '🕐 Created',
                        value: new Date().toLocaleString(),
                        inline: true
                    }
                )
                .setFooter({ text: 'ByteBunny Support System' });

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('🔒 Close Ticket')
                        .setStyle(ButtonStyle.Secondary)
                );

            await ticketChannel.send({
                content: `${message.author} <@&${process.env.STAFF_ROLE_ID}>`,
                embeds: [embed],
                components: [actionRow]
            });

            await message.reply(`✅ Ticket created: ${ticketChannel}`);

        } catch (error) {
            console.error('Error creating manual ticket:', error);
            await message.reply('❌ Failed to create ticket. Please contact an administrator.');
        }
    }

    async confirmPurchase(interaction) {
        try {
            const ticketData = this.activeTickets.get(interaction.channel.id);
            if (!ticketData) {
                return await interaction.reply({ content: '❌ Ticket data not found.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Order Confirmed')
                .setDescription('This purchase request has been processed by staff.')
                .setColor('#10b981')
                .addFields(
                    {
                        name: '👨‍💼 Processed By',
                        value: `${interaction.user} (${interaction.user.tag})`,
                        inline: true
                    },
                    {
                        name: '🕐 Processed At',
                        value: new Date().toLocaleString(),
                        inline: true
                    }
                )
                .setFooter({ text: 'Order Status: Confirmed' })
                .setTimestamp();

            await interaction.update({
                embeds: [embed],
                components: []
            });

            // Update ticket status
            ticketData.status = 'confirmed';
            ticketData.processedBy = interaction.user.id;
            ticketData.processedAt = new Date();

            await this.logActivity(`✅ Purchase confirmed by ${interaction.user.tag} in ${interaction.channel.name}`);

        } catch (error) {
            console.error('Error confirming purchase:', error);
            await interaction.reply({ content: '❌ Error processing confirmation.', ephemeral: true });
        }
    }

    async cancelPurchase(interaction) {
        try {
            const ticketData = this.activeTickets.get(interaction.channel.id);
            if (!ticketData) {
                return await interaction.reply({ content: '❌ Ticket data not found.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('❌ Order Cancelled')
                .setDescription('This purchase request has been cancelled by staff.')
                .setColor('#ef4444')
                .addFields(
                    {
                        name: '👨‍💼 Cancelled By',
                        value: `${interaction.user} (${interaction.user.tag})`,
                        inline: true
                    },
                    {
                        name: '🕐 Cancelled At',
                        value: new Date().toLocaleString(),
                        inline: true
                    }
                )
                .setFooter({ text: 'Order Status: Cancelled' })
                .setTimestamp();

            await interaction.update({
                embeds: [embed],
                components: []
            });

            // Update ticket status
            ticketData.status = 'cancelled';
            ticketData.processedBy = interaction.user.id;
            ticketData.processedAt = new Date();

            await this.logActivity(`❌ Purchase cancelled by ${interaction.user.tag} in ${interaction.channel.name}`);

        } catch (error) {
            console.error('Error cancelling purchase:', error);
            await interaction.reply({ content: '❌ Error processing cancellation.', ephemeral: true });
        }
    }

    async closeTicketInteraction(interaction) {
        try {
            const ticketData = this.activeTickets.get(interaction.channel.id);
            
            const embed = new EmbedBuilder()
                .setTitle('🔒 Ticket Closed')
                .setDescription('This ticket has been closed by staff.')
                .setColor('#6b7280')
                .addFields(
                    {
                        name: '👨‍💼 Closed By',
                        value: `${interaction.user} (${interaction.user.tag})`,
                        inline: true
                    },
                    {
                        name: '🕐 Closed At',
                        value: new Date().toLocaleString(),
                        inline: true
                    }
                )
                .setFooter({ text: 'Ticket Status: Closed' });

            await interaction.reply({ embeds: [embed] });

            // Schedule channel deletion
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                    this.activeTickets.delete(interaction.channel.id);
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 5000);

            await this.logActivity(`🔒 Ticket closed by ${interaction.user.tag}: ${interaction.channel.name}`);

        } catch (error) {
            console.error('Error closing ticket:', error);
            await interaction.reply({ content: '❌ Error closing ticket.', ephemeral: true });
        }
    }

    async closeTicket(message) {
        if (!message.channel.name.includes('ticket') && !message.channel.name.includes('checkout')) {
            return await message.reply('❌ This command can only be used in ticket channels.');
        }

        try {
            const embed = new EmbedBuilder()
                .setTitle('🔒 Ticket Closed')
                .setDescription('This ticket has been closed.')
                .setColor('#6b7280')
                .addFields(
                    {
                        name: '👨‍💼 Closed By',
                        value: `${message.author} (${message.author.tag})`,
                        inline: true
                    },
                    {
                        name: '🕐 Closed At',
                        value: new Date().toLocaleString(),
                        inline: true
                    }
                );

            await message.channel.send({ embeds: [embed] });

            setTimeout(async () => {
                try {
                    await message.channel.delete();
                    this.activeTickets.delete(message.channel.id);
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 5000);

        } catch (error) {
            console.error('Error closing ticket:', error);
            await message.reply('❌ Failed to close ticket.');
        }
    }

    async sendHelpEmbed(message) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 ByteBunny Bot Commands')
            .setDescription('Available commands for the ByteBunny Discord Bot')
            .setColor(process.env.EMBED_COLOR || '#ff4757')
            .addFields(
                {
                    name: '🎫 Ticket Commands',
                    value: '`!ticket [reason]` - Create a support ticket\n`!close` - Close the current ticket',
                    inline: false
                },
                {
                    name: '📊 Information Commands',
                    value: '`!status` - Show bot status\n`!help` - Show this help message',
                    inline: false
                },
                {
                    name: '🛒 Purchase System',
                    value: 'Purchase tickets are automatically created when customers checkout on the website.',
                    inline: false
                }
            )
            .setFooter({ 
                text: 'ByteBunny Support System',
                iconURL: this.client.user.displayAvatarURL()
            })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
    }

    async showBotStatus(message) {
        const guild = this.client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Bot Status')
            .setColor(process.env.EMBED_COLOR || '#ff4757')
            .addFields(
                {
                    name: '🤖 Bot Information',
                    value: `**Status:** Online\n**Uptime:** ${this.formatUptime(this.client.uptime)}\n**Ping:** ${this.client.ws.ping}ms`,
                    inline: true
                },
                {
                    name: '🏪 Server Information',
                    value: `**Server:** ${guild?.name || 'Unknown'}\n**Members:** ${guild?.memberCount || 'Unknown'}\n**Active Tickets:** ${this.activeTickets.size}`,
                    inline: true
                }
            )
            .setFooter({ text: 'ByteBunny Bot v1.0.0' })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
    }

    async logActivity(message, data = null) {
        try {
            const logChannel = this.client.channels.cache.get(process.env.LOG_CHANNEL_ID);
            if (!logChannel) return;

            const embed = new EmbedBuilder()
                .setDescription(message)
                .setColor('#6b7280')
                .setTimestamp();

            if (data) {
                embed.addFields({
                    name: 'Additional Data',
                    value: `\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 1000)}\`\`\``,
                    inline: false
                });
            }

            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }

    formatUptime(uptime) {
        const seconds = Math.floor((uptime / 1000) % 60);
        const minutes = Math.floor((uptime / (1000 * 60)) % 60);
        const hours = Math.floor((uptime / (1000 * 60 * 60)) % 24);
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));

        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    // API endpoint to create checkout tickets from backend
    async handleWebhookCheckout(checkoutData) {
        console.log('🎫 Creating checkout ticket for:', checkoutData);
        
        const result = await this.createCheckoutTicket(checkoutData);
        
        return {
            success: true,
            ticketId: result.ticketId,
            channelId: result.channel.id,
            channelName: result.channel.name
        };
    }
}

// Initialize bot
const bot = new ByteBunnyBot();

// Export for webhook usage
module.exports = bot;

// Handle process termination
process.on('SIGINT', () => {
    console.log('🔄 Shutting down ByteBunny Bot...');
    bot.client.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});
