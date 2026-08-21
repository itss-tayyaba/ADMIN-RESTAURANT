// Creates the third, independent customer branch: Australia.
// It is safe to run more than once; the branch is updated rather than duplicated.

const dns = require('dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();

const mongoose = require('mongoose');

const Branch = require('../src/models/Branch');

async function seedAustraliaBranch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const branch = await Branch.findOneAndUpdate(
      { code: 'australia' },
      {
        $set: {
          name: 'Ember & Brew Australia',
          code: 'australia',

          country: 'Australia',
          countryCode: 'AU',
          city: 'Sydney',

          currency: 'AUD',
          currencySymbol: 'A$',
          timezone: 'Australia/Sydney',

          taxRate: 0.10,

          address: 'Sydney branch',

          heroImage: '/images/Avacado toast.jpeg',

          deliveryZones: ['Sydney'],

          paymentMethods: [
            'Card',
            'Apple Pay',
            'Google Pay'
          ],

          // Sydney, Australia
          // GeoJSON uses [longitude, latitude]
          location: {
            type: 'Point',
            coordinates: [151.2093, -33.8688]
          },

          // 5 km delivery radius
          deliveryRadiusKm: 5,

          isActive: true
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(`Australia branch ready: ${branch.name}`);
    console.log(`Australia branch code: ${branch.code}`);
    console.log(`Australia order URL: /order/${branch.code}`);
    console.log('Location:', branch.location);
  } catch (error) {
    console.error('Could not seed Australia branch:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedAustraliaBranch();