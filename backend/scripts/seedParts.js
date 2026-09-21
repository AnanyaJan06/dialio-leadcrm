import dns from 'node:dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Part from '../model/Part.js';
import User from '../model/User.js';

dns.setServers(['8.8.8.8', '1.1.1.1']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const vehicleTemplates = [
  // Toyota
  { make: 'Toyota', model: 'Camry', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['SE', 'LE', 'XSE', 'XLE'] },
  { make: 'Toyota', model: 'RAV4', years: ['2019', '2020', '2021', '2022', '2023'], trims: ['XLE', 'Adventure', 'Limited', 'LE'] },
  { make: 'Toyota', model: 'Tacoma', years: ['2017', '2018', '2019', '2020', '2021'], trims: ['TRD Off-Road', 'SR5', 'TRD Sport', 'Limited'] },
  { make: 'Toyota', model: 'Corolla', years: ['2019', '2020', '2021', '2022', '2023'], trims: ['LE', 'SE', 'XSE'] },
  { make: 'Toyota', model: 'Highlander', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['XLE', 'Limited', 'Platinum'] },

  // Honda
  { make: 'Honda', model: 'Civic', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['EX', 'Sport', 'Touring', 'LX'] },
  { make: 'Honda', model: 'Accord', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['Sport 1.5T', 'EX-L', 'Touring 2.0T'] },
  { make: 'Honda', model: 'CR-V', years: ['2017', '2018', '2019', '2020', '2021'], trims: ['EX', 'EX-L', 'Touring'] },
  { make: 'Honda', model: 'Pilot', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['EX-L', 'Touring', 'Elite'] },

  // Ford
  { make: 'Ford', model: 'F-150', years: ['2017', '2018', '2019', '2020', '2021', '2022'], trims: ['XLT', 'Lariat', 'King Ranch', 'Platinum'] },
  { make: 'Ford', model: 'Explorer', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['XLT', 'Limited', 'ST', 'Platinum'] },
  { make: 'Ford', model: 'Mustang', years: ['2017', '2018', '2019', '2020', '2021'], trims: ['EcoBoost Premium', 'GT Premium', 'Mach 1'] },
  { make: 'Ford', model: 'Escape', years: ['2019', '2020', '2021', '2022'], trims: ['SE', 'SEL', 'Titanium'] },

  // Chevrolet
  { make: 'Chevrolet', model: 'Silverado 1500', years: ['2017', '2018', '2019', '2020', '2021', '2022'], trims: ['LT', 'RST', 'LTZ', 'High Country'] },
  { make: 'Chevrolet', model: 'Equinox', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['LT', 'Premier', 'RS'] },
  { make: 'Chevrolet', model: 'Tahoe', years: ['2017', '2018', '2019', '2020', '2021'], trims: ['LT', 'Premier', 'Z71', 'High Country'] },
  { make: 'Chevrolet', model: 'Malibu', years: ['2018', '2019', '2020', '2021'], trims: ['LT', 'Premier', 'RS'] },

  // Subaru
  { make: 'Subaru', model: 'Outback', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['Premium', 'Limited', 'Touring XT', 'Onyx Edition XT'] },
  { make: 'Subaru', model: 'Forester', years: ['2019', '2020', '2021', '2022'], trims: ['Sport', 'Limited', 'Touring', 'Premium'] },
  { make: 'Subaru', model: 'Crosstrek', years: ['2019', '2020', '2021', '2022', '2023'], trims: ['Premium', 'Sport', 'Limited'] },
  { make: 'Subaru', model: 'WRX', years: ['2018', '2019', '2020', '2021'], trims: ['Base', 'Premium', 'Limited', 'STI'] },

  // Nissan
  { make: 'Nissan', model: 'Altima', years: ['2019', '2020', '2021', '2022'], trims: ['SV', 'SR', 'SL', 'Platinum'] },
  { make: 'Nissan', model: 'Rogue', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['SV', 'SL', 'Platinum'] },
  { make: 'Nissan', model: 'Pathfinder', years: ['2018', '2019', '2020', '2022'], trims: ['SV', 'SL', 'Platinum'] },

  // BMW
  { make: 'BMW', model: '3 Series', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['330i', '330i xDrive', 'M340i'] },
  { make: 'BMW', model: '5 Series', years: ['2018', '2019', '2020', '2021'], trims: ['530i', '540i xDrive', 'M550i'] },
  { make: 'BMW', model: 'X3', years: ['2019', '2020', '2021', '2022'], trims: ['sDrive30i', 'xDrive30i', 'M40i'] },
  { make: 'BMW', model: 'X5', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['xDrive40i', 'M50i'] },

  // Mercedes-Benz
  { make: 'Mercedes-Benz', model: 'C-Class', years: ['2018', '2019', '2020', '2021'], trims: ['C300', 'C300 4MATIC', 'AMG C43'] },
  { make: 'Mercedes-Benz', model: 'GLC', years: ['2019', '2020', '2021', '2022'], trims: ['GLC 300', 'GLC 300 4MATIC'] },
  { make: 'Mercedes-Benz', model: 'E-Class', years: ['2018', '2019', '2020', '2021'], trims: ['E350', 'E450 4MATIC'] },

  // Jeep
  { make: 'Jeep', model: 'Grand Cherokee', years: ['2017', '2018', '2019', '2020', '2021'], trims: ['Laredo', 'Limited', 'Overland', 'Summit'] },
  { make: 'Jeep', model: 'Wrangler', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['Sport S', 'Sahara', 'Rubicon'] },

  // Hyundai & Kia
  { make: 'Hyundai', model: 'Elantra', years: ['2019', '2020', '2021', '2022'], trims: ['SEL', 'Limited', 'N Line'] },
  { make: 'Hyundai', model: 'Tucson', years: ['2019', '2020', '2021', '2022'], trims: ['SEL', 'Limited', 'N Line'] },
  { make: 'Kia', model: 'Optima', years: ['2017', '2018', '2019', '2020'], trims: ['LX', 'EX', 'SX Turbo'] },
  { make: 'Kia', model: 'Sportage', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['LX', 'EX', 'SX Turbo'] },

  // Mazda
  { make: 'Mazda', model: 'CX-5', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['Touring', 'Grand Touring', 'Signature Turbo'] },
  { make: 'Mazda', model: 'Mazda3', years: ['2019', '2020', '2021', '2022'], trims: ['Select', 'Preferred', 'Premium Turbo'] },

  // Volkswagen & Audi
  { make: 'Volkswagen', model: 'Jetta', years: ['2019', '2020', '2021', '2022'], trims: ['R-Line', 'SEL', 'GLI'] },
  { make: 'Volkswagen', model: 'Tiguan', years: ['2018', '2019', '2020', '2021'], trims: ['SE', 'SEL R-Line'] },
  { make: 'Audi', model: 'A4', years: ['2018', '2019', '2020', '2021'], trims: ['Premium', 'Premium Plus', 'Prestige'] },
  { make: 'Audi', model: 'Q5', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['Premium Plus', 'Prestige'] },

  // Lexus
  { make: 'Lexus', model: 'RX 350', years: ['2018', '2019', '2020', '2021', '2022'], trims: ['Base', 'F Sport', 'Luxury'] },
  { make: 'Lexus', model: 'ES 350', years: ['2019', '2020', '2021', '2022'], trims: ['Premium', 'F Sport', 'Ultra Luxury'] },
];

const partTypes = [
  {
    productType: 'Engine',
    names: [
      'Complete Engine Assembly 2.5L 4-Cyl',
      'Engine Long Block 2.0L Turbo',
      '3.5L V6 DOHC Engine Assembly',
      '5.3L V8 EcoTec3 Engine Assembly',
      '1.5L Turbocharged Engine Assembly',
      '3.6L V6 24V VVT Engine Assembly',
      '2.4L Turbo 4-Cylinder Engine Assembly',
      '3.0L Twin-Turbo Inline-6 Engine',
    ],
    priceRange: [1350, 3200],
  },
  {
    productType: 'Transmission',
    names: [
      'Automatic Transmission Assembly 6-Speed',
      'Automatic Transmission Assembly 8-Speed',
      '10-Speed Electronic Automatic Transmission',
      'CVT Automatic Transmission Assembly',
      'AWD Automatic Transmission with Transfer Case',
      'Lineartronic CVT Transmission',
      'Dual-Clutch 7-Speed Automatic Transmission',
    ],
    priceRange: [750, 2100],
  },
  {
    productType: 'A/C Compressor',
    names: [
      'A/C Compressor with Clutch Assembly',
      'OEM Air Conditioning Compressor Pump',
      'Heavy Duty A/C Compressor Unit',
    ],
    priceRange: [180, 420],
  },
  {
    productType: 'Alternator',
    names: [
      'OEM High Output 150-Amp Alternator',
      'Alternator Charging Generator 130A',
      '180-Amp Heavy Duty Alternator Unit',
    ],
    priceRange: [120, 290],
  },
  {
    productType: 'Starter Motor',
    names: [
      'Engine Starter Motor Assembly 1.4kW',
      'OEM High-Torque Starter Motor',
      'Heavy Duty Electric Starter Motor 1.6kW',
    ],
    priceRange: [95, 230],
  },
  {
    productType: 'Turbocharger',
    names: [
      'Twin-Scroll Exhaust Turbocharger Assembly',
      'OEM Factory Turbocharger with Wastegate',
      'Turbocharger with Electronic Actuator',
    ],
    priceRange: [520, 1150],
  },
  {
    productType: 'Steering Rack',
    names: [
      'Electric Power Steering Gear Rack & Pinion',
      'Power Steering Rack and Pinion Assembly',
      'Hydraulic Steering Gear Rack with Inner Tie Rods',
    ],
    priceRange: [280, 680],
  },
  {
    productType: 'Brake Caliper',
    names: [
      'Front Left Driver Brake Caliper Assembly',
      'Front Right Passenger Brake Caliper Assembly',
      'Dual Piston Front Brake Caliper Set',
      'Brembo 4-Piston Performance Brake Caliper',
    ],
    priceRange: [110, 350],
  },
  {
    productType: 'Radiator',
    names: [
      'Engine Cooling Radiator Assembly with Oil Cooler',
      'Aluminum Dual-Core Engine Radiator',
      'OEM Direct Fit Engine Cooling Radiator',
    ],
    priceRange: [140, 310],
  },
  {
    productType: 'Transfer Case',
    names: [
      'AWD Electronic Transfer Case Assembly',
      '4WD Transfer Case with Shift Motor',
      'Active Transfer Case Unit',
    ],
    priceRange: [450, 1100],
  },
  {
    productType: 'Differential',
    names: [
      'Rear Differential Carrier Assembly 3.73 Ratio',
      'Front Differential Axle Assembly 3.42 Ratio',
      'Limited Slip Rear Axle Differential Carrier',
    ],
    priceRange: [380, 890],
  },
  {
    productType: 'Fuel Pump',
    names: [
      'High-Pressure Direct Injection Fuel Pump (HPFP)',
      'In-Tank Fuel Pump Assembly with Sender',
      'Electric High Flow Fuel Pump Module',
    ],
    priceRange: [160, 410],
  },
  {
    productType: 'ABS Module',
    names: [
      'ABS Pump and Control Module Assembly',
      'Anti-Lock Brake Hydraulic Control Unit',
      'Electronic Stability Control ABS Actuator Pump',
    ],
    priceRange: [220, 540],
  },
];

const conditions = [
  'OEM Used',
  'Used - Grade A',
  'Remanufactured',
  'Used - Tested',
  'Refurbished',
  'Tested / Inspected OEM',
];

const mileageValues = [
  '18,400 mi', '22,150 mi', '27,800 mi', '31,500 mi', '34,200 mi',
  '38,900 mi', '42,100 mi', '45,600 mi', '49,300 mi', '52,800 mi',
  '56,200 mi', '59,750 mi', '63,100 mi', '67,400 mi', '71,200 mi',
  '74,800 mi', '78,350 mi', '82,100 mi', '85,900 mi', '89,400 mi',
  '92,600 mi', '96,500 mi', '104,200 mi', '112,500 mi', '118,000 mi',
];

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function seedParts(totalCount = 100) {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const admin = await User.findOne({ role: 'admin' }).lean();
    const createdBy = admin ? admin._id : null;

    console.log('🗑️ Deleting all existing parts from database...');
    const deleteResult = await Part.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} existing parts.`);

    console.log(`Generating ${totalCount} new realistic auto parts records with the updated schema...`);
    const newParts = [];

    for (let i = 1; i <= totalCount; i++) {
      const skuNumber = String(1000 + i).padStart(4, '0');
      const externalId = `SKU-${skuNumber}`;

      const vehicle = vehicleTemplates[(i - 1) % vehicleTemplates.length];
      const year = vehicle.years[(i - 1) % vehicle.years.length];
      const trim = vehicle.trims[(i - 1) % vehicle.trims.length];
      const partGroup = partTypes[(i - 1) % partTypes.length];
      const partName = partGroup.names[(i - 1) % partGroup.names.length];

      const title = `${year} ${vehicle.make} ${vehicle.model} ${trim} ${partName}`;
      const price = getRandomInt(partGroup.priceRange[0], partGroup.priceRange[1]);
      // ~85% in stock, ~15% out of stock
      const availability = i % 7 === 0 ? 'out of stock' : 'in stock';
      const condition = conditions[(i - 1) % conditions.length];
      const mileage = mileageValues[(i - 1) % mileageValues.length];
      const productType = partGroup.productType;

      newParts.push({
        externalId,
        title,
        part: partName,
        make: vehicle.make,
        model: vehicle.model,
        year,
        trim,
        price,
        currency: 'USD',
        availability,
        condition,
        mileage,
        productType,
        createdBy,
      });
    }

    console.log('💾 Inserting 100 new parts into MongoDB...');
    const inserted = await Part.insertMany(newParts);
    console.log(`✅ Successfully seeded ${inserted.length} parts into MongoDB!`);

    // Verify
    const count = await Part.countDocuments();
    const inStock = await Part.countDocuments({ availability: 'in stock' });
    const outOfStock = await Part.countDocuments({ availability: 'out of stock' });
    const distinctMakes = await Part.distinct('make');
    const withMileage = await Part.countDocuments({ mileage: { $exists: true, $ne: '' } });

    console.log('\n📊 Stock Inventory Summary:');
    console.log(`Total Parts: ${count}`);
    console.log(`In Stock: ${inStock}`);
    console.log(`Out of Stock: ${outOfStock}`);
    console.log(`Distinct Makes (${distinctMakes.length}): ${distinctMakes.join(', ')}`);
    console.log(`Parts with Mileage: ${withMileage} / ${count}`);

    const sample = await Part.findOne().lean();
    console.log('\nSample Seeded Part:\n', JSON.stringify(sample, null, 2));

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB. Seed complete!');
    return inserted;
  } catch (error) {
    console.error('❌ Error seeding parts:', error);
    process.exit(1);
  }
}

// Run directly if invoked as script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedParts(100);
}
