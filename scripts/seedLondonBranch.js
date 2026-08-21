// Creates the initial UK branch and its independent menu.
// Safe to re-run: it updates these three London items without touching Pakistan data.

const dns = require('dns');

// Fix Node.js MongoDB SRV DNS timeout
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();

const mongoose = require('mongoose');

const Branch = require('../src/models/Branch');
const MenuItem = require('../src/models/MenuItem');

const londonMenu = [
  {
    name: 'Chicken Burger',
    description: 'Grilled chicken, crisp lettuce and house sauce.',
    price: 8.99,
    category: 'Burgers',
    image: '/images/grilled cheese sandwich.jpeg'
  },
  {
    name: 'Beef Burger',
    description: 'Juicy beef patty, cheese and Ember & Brew sauce.',
    price: 9.99,
    category: 'Burgers',
    image: '/images/grilled cheese sandwich.jpeg'
  },
  {
    name: 'Fries',
    description: 'Crisp seasoned fries.',
    price: 3.00,
    category: 'Sides',
    image: '/images/Fajita Pizza.jpeg'
  }
];

async function seedLondonBranch() {
  try {
    console.log('Connecting to MongoDB...');

    await mongoose.connect(process.env.MONGODB_URI);

    console.log('Connected to MongoDB.');

    const branch = await Branch.findOneAndUpdate(
      { code: 'london-uk' },
      {
        $set: {
          name: 'Ember & Brew London',
          code: 'london-uk',

          country: 'United Kingdom',
          countryCode: 'GB',
          city: 'London',

          currency: 'GBP',
          currencySymbol: '£',

          timezone: 'Europe/London',
          taxRate: 0.20,

          address: 'London branch',
          heroImage: '/images/grilled cheese sandwich.jpeg',

          // Central London coordinates
          // GeoJSON format: [longitude, latitude]
          location: {
            type: 'Point',
            coordinates: [-0.1276, 51.5072]
          },

          deliveryZones: [
            'Central London',
            'East London',
            'North London',
            'South London',
            'West London'
          ],

          paymentMethods: [
            'Card',
            'Apple Pay',
            'Google Pay',
            'Cash on delivery'
          ],

          isActive: true
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(`London branch ready: ${branch.name}`);

    for (const item of londonMenu) {
      await MenuItem.findOneAndUpdate(
        {
          branchId: branch._id,
          name: item.name
        },
        {
          $set: {
            ...item,
            branchId: branch._id,
            available: true
          }
        },
        {
          upsert: true,
          setDefaultsOnInsert: true
        }
      );

      console.log(`Menu item ready: ${item.name}`);
    }

    console.log(`London order URL: /order/${branch.code}`);
    console.log('London branch seeding completed successfully.');
  } catch (error) {
    console.error('Could not seed London branch:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedLondonBranch();
