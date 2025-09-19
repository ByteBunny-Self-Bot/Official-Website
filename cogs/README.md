# ByteBunny Backend API

A comprehensive backend API for the ByteBunny selfbot platform, designed to be hosted on Render's free tier.

## Features

- **Authentication System**: JWT-based authentication with secure user registration and login
- **License Management**: Complete license lifecycle management with activation, verification, and expiration tracking
- **Payment Processing**: Stripe integration for secure payment processing
- **Download Management**: Secure file downloads with license verification
- **User Dashboard**: Complete dashboard functionality with statistics and activity tracking
- **Admin Panel**: Administrative functions for user and license management
- **MongoDB Integration**: Robust data persistence with Mongoose ODM

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (JSON Web Tokens)
- **Payments**: Stripe
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Express Validator

## Project Structure

```
cogs/
├── config/
│   └── database.js          # MongoDB connection configuration
├── middleware/
│   └── auth.js             # Authentication middleware
├── models/
│   ├── User.js             # User data model
│   ├── License.js          # License data model
│   └── Download.js         # Download data model
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── dashboard.js        # Dashboard API routes
│   ├── licenses.js         # License management routes
│   ├── users.js            # User management routes
│   ├── payments.js         # Payment processing routes
│   └── downloads.js        # Download management routes
├── .env.example            # Environment variables template
├── package.json            # Project dependencies
├── server.js              # Main server file
└── README.md              # This file
```

## Setup Instructions

### 1. Environment Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your environment variables:
   ```env
   NODE_ENV=production
   PORT=3000
   FRONTEND_URL=https://yourusername.github.io
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/bytebunny
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRE=7d
   STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
   STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
   ```

### 2. Dependencies Installation

```bash
npm install
```

### 3. Database Setup

1. Create a MongoDB Atlas account (free tier available)
2. Create a new cluster and database
3. Get your connection string and add it to `MONGODB_URI`

### 4. Stripe Setup

1. Create a Stripe account
2. Get your API keys from the Stripe dashboard
3. Set up webhooks for payment confirmation
4. Add webhook endpoint: `https://your-backend-url.onrender.com/api/payments/webhook`

## Deployment on Render

### 1. Create Render Account

Sign up at [render.com](https://render.com) (free tier available)

### 2. Connect Repository

1. Connect your GitHub repository to Render
2. Select "Web Service" for deployment type

### 3. Configuration

Set the following in Render dashboard:

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment**: Node
- **Plan**: Free (or paid for better performance)

### 4. Environment Variables

Add all environment variables from your `.env` file in the Render dashboard under "Environment".

### 5. Deploy

Render will automatically deploy your application. The URL will be something like:
`https://bytebunny-backend.onrender.com`

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/user` - Get current user
- `POST /api/auth/refresh` - Refresh JWT token

### Dashboard
- `GET /api/dashboard/stats` - User dashboard statistics
- `GET /api/dashboard/licenses` - User licenses
- `GET /api/dashboard/downloads` - Download history
- `GET /api/dashboard/activity` - Activity feed
- `PUT /api/dashboard/profile` - Update profile

### Licenses
- `GET /api/licenses` - Get user licenses
- `POST /api/licenses/verify` - Verify license key
- `POST /api/licenses/activate` - Activate license

### Payments
- `POST /api/payments/create-intent` - Create payment intent
- `POST /api/payments/confirm` - Confirm payment
- `GET /api/payments/history` - Payment history
- `GET /api/payments/pricing` - Get pricing info

### Downloads
- `GET /api/downloads` - Available downloads
- `POST /api/downloads/:id/download` - Generate download link
- `GET /api/downloads/history` - Download history

### Users (Admin)
- `GET /api/users` - Get all users (admin only)
- `PUT /api/users/:id/role` - Update user role (admin only)
- `PUT /api/users/:id/status` - Update user status (admin only)

## Frontend Integration

Update your frontend `dashboard.js` file to use your deployed backend URL:

```javascript
this.apiBaseUrl = 'https://your-backend-url.onrender.com/api';
```

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents API abuse
- **CORS Protection**: Controls cross-origin requests
- **Helmet**: Sets various HTTP headers for security
- **Input Validation**: Validates all user inputs
- **Password Hashing**: Uses bcrypt for secure password storage

## Database Models

### User Model
- Authentication data (username, email, password)
- Profile information
- Subscription status
- Security settings
- Usage statistics

### License Model
- License keys with activation status
- Product and license type information
- Expiration tracking
- Usage monitoring
- Payment information

### Download Model
- File information and metadata
- Download tracking
- Access control
- Version management

## Monitoring and Logging

The application includes:
- Health check endpoint (`/api/health`)
- Error logging and handling
- Request monitoring
- Database connection monitoring

## Troubleshooting

### Common Issues

1. **Database Connection**: Ensure MongoDB URI is correct and database is accessible
2. **CORS Errors**: Check FRONTEND_URL environment variable
3. **Payment Issues**: Verify Stripe keys and webhook configuration
4. **JWT Errors**: Ensure JWT_SECRET is set and consistent

### Render Free Tier Limitations

- Service sleeps after 15 minutes of inactivity
- 750 hours per month (can serve multiple apps)
- 512MB RAM limit
- No persistent storage (use MongoDB Atlas)

### Performance Optimization

For production use, consider:
- Upgrading to Render's paid plan
- Using Redis for session storage
- Implementing API caching
- Database indexing optimization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support with the backend setup:
1. Check the troubleshooting section
2. Review Render's documentation
3. Contact support through the dashboard

---

**Note**: Remember to update the `FRONTEND_URL` in your environment variables to match your GitHub Pages URL, and update the `apiBaseUrl` in your frontend dashboard.js to point to your deployed Render backend.
