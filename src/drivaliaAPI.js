const fetch = require('node-fetch');

class DrivaliaAPI {
  constructor(username = 'Ally Blair', password = '9Mu@.5Qw2!XXtaF') {
    this.baseURL = 'https://www.caafgenus3.co.uk/WebApp/api';
    this.username = username;
    this.password = password;
    this.cookies = null;
    this.sessionData = null;
  }

  async login() {
    try {
      // Step 1: Call actuator/info to establish session (required before login)
      console.log('Drivalia API: Establishing session...');
      const infoResponse = await fetch(`${this.baseURL}/actuator/info`);
      const infoSetCookie = infoResponse.headers.get('set-cookie');
      if (infoSetCookie) {
        this.cookies = infoSetCookie;
      }
      console.log('Drivalia API: Session established');

      // Step 2: Login with credentials
      console.log('Drivalia API: Logging in...');
      console.log('Drivalia API: URL:', `${this.baseURL}/login`);
      console.log('Drivalia API: Username:', this.username);

      const response = await fetch(`${this.baseURL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': this.cookies || '',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://www.caafgenus3.co.uk',
          'Referer': 'https://www.caafgenus3.co.uk/WebApp/',
          'Accept': 'application/json, text/plain, */*'
        },
        body: new URLSearchParams({
          username: this.username,
          password: this.password
        })
      });

      console.log('Drivalia API: Response status:', response.status);

      // Check if response is HTML (error page)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        const html = await response.text();
        console.error('Drivalia API: Received HTML instead of JSON');
        console.error('First 500 chars:', html.substring(0, 500));
        throw new Error('Login failed: API returned HTML error page. Check credentials or API endpoint.');
      }

      // Merge cookies from login response
      const loginSetCookie = response.headers.get('set-cookie');
      if (loginSetCookie) {
        // Combine existing cookies with new ones
        this.cookies = this.cookies
          ? `${this.cookies}; ${loginSetCookie}`
          : loginSetCookie;
      }

      const data = await response.json();
      console.log('Drivalia API: Login response:', data);

      // Get session data
      const session = await this.getSession();
      this.sessionData = session;

      return { loginData: data, session };
    } catch (error) {
      console.error('Drivalia API: Login failed:', error.message);
      throw error;
    }
  }

  async getSession() {
    return await this.fetch('/user/data/session');
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Cookie': this.cookies || ''
      }
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }

  // Vehicle Catalog Navigation
  async getMakes() {
    return await this.fetch('/catalog/makes?sortBy=make');
  }

  async getModels(makeCode) {
    return await this.fetch(`/catalog/models?makeCode=${makeCode}&sortBy=model`);
  }

  async getVariants(makeCode, modelCode) {
    return await this.fetch(
      `/catalog/variant?makeCode=${makeCode}&modelCode=${modelCode}&sortBy=variant`
    );
  }

  async findVariant(make, model, variant) {
    console.log(`Drivalia API: Looking for vehicle: ${make} ${model} ${variant}`);
    
    const makes = await this.getMakes();
    const makeObj = makes.find(m => 
      m.name.toLowerCase().includes(make.toLowerCase())
    );
    
    if (!makeObj) throw new Error(`Make not found: ${make}`);
    console.log(`Drivalia API: Found make: ${makeObj.name} (${makeObj.code})`);
    
    const models = await this.getModels(makeObj.code);
    const modelObj = models.find(m => 
      m.name.toLowerCase().includes(model.toLowerCase())
    );
    
    if (!modelObj) throw new Error(`Model not found: ${model} for make ${makeObj.name}`);
    console.log(`Drivalia API: Found model: ${modelObj.name} (${modelObj.code})`);
    
    const variants = await this.getVariants(makeObj.code, modelObj.code);
    const variantObj = variants.find(v => 
      v.name.toLowerCase().includes(variant.toLowerCase())
    );
    
    if (!variantObj) {
      console.log(`Available variants for ${makeObj.name} ${modelObj.name}:`, 
        variants.map(v => v.name).slice(0, 5));
      throw new Error(`Variant not found: ${variant} for ${makeObj.name} ${modelObj.name}`);
    }
    
    console.log(`Drivalia API: Found variant: ${variantObj.name} (${variantObj.xrefCode})`);
    return variantObj;
  }

  // Quote Calculation
  async calculateQuote({
    vehicle,           // From findVariant()
    term,              // 24, 36, 48, 60
    annualMileage,     // 5000, 8000, 10000, etc
    maintenance = false,
    deposit = 0,
    productId = 2104   // Contract Hire default
  }) {
    
    console.log(`Drivalia API: Calculating quote for ${vehicle.name}, ${term}m, ${annualMileage} miles`);
    
    const requestBody = {
      asset: {
        xrefCode: vehicle.xrefCode,
        displayIdentifier: vehicle.name,
        name: vehicle.name,
        makeCode: vehicle.makeCode,
        modelCode: vehicle.modelCode,
        variantCode: vehicle.variantCode,
        transmission: vehicle.transmission,
        fuel: vehicle.fuel,
        co2Emission: vehicle.co2,
        doors: vehicle.doors,
        cataloguePrice: vehicle.p11d,
        vatExempt: false,
        capId: vehicle.capId
      },
      product: {
        quoteItem: {
          id: productId,
          name: "Contract Hire",
          type: "LEASE",
          productCode: "CH",
          family: "Lease",
          funderId: 1,
          basisOfCharge: "RENTALS_BASED_ON_TIME",
          capitalContribution: true
        }
      },
      proposal: {
        term: term,
        assetMeterUsage: {
          type: "MI",
          multiplier: 1000,
          multiplicandMeterUsage: annualMileage / 1000,
          meterUsage: annualMileage
        },
        initialCapitalReduction: deposit,
        maintenanceTerms: maintenance ? term : 0,
        lossOfUseEnabled: false,
        tyreReplacementEnabled: false,
        vatRegistered: true,
        margin: 8.7,
        baseRate: 8.7,
        commissionTypeId: 3
      }
    };

    const response = await this.fetch('/asset/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    return this.formatQuoteResponse(response, vehicle, term, annualMileage, maintenance);
  }

  formatQuoteResponse(response, vehicle, term, annualMileage, maintenance) {
    return {
      // Vehicle info
      vehicle: {
        make: vehicle.makeCode,
        model: vehicle.modelCode,
        variant: vehicle.name,
        capId: vehicle.capId,
        xrefCode: vehicle.xrefCode
      },
      
      // Quote config
      config: {
        term,
        annualMileage,
        maintenance
      },
      
      // Pricing
      monthlyPayment: {
        net: response.rentalPayment?.rentalNet || 0,
        gross: response.rentalPayment?.rentalGross || 0,
        vat: (response.rentalPayment?.rentalGross || 0) - (response.rentalPayment?.rentalNet || 0)
      },
      totalCost: {
        net: response.totalCharge?.net || 0,
        gross: response.totalCharge?.gross || 0,
        vat: response.totalCharge?.vat || 0
      },
      residualValue: {
        net: response.residualValue?.net || 0,
        gross: response.residualValue?.gross || 0
      },
      vehicleData: {
        p11d: response.p11d || vehicle.p11d,
        co2: response.co2Emission || vehicle.co2
      },
      
      // Metadata
      timestamp: new Date().toISOString(),
      provider: 'drivalia'
    };
  }

  // Bulk processing
  async processBatch(vehicles, config) {
    const results = [];
    console.log(`Drivalia API: Processing batch of ${vehicles.length} vehicles`);
    
    for (const vehicle of vehicles) {
      try {
        // Find vehicle in catalog
        const variantData = await this.findVariant(
          vehicle.make,
          vehicle.model,
          vehicle.variant
        );

        // Calculate quotes for all term/mileage combinations
        const terms = config.terms === 'ALL' 
          ? [24, 36, 48, 60] 
          : [Number(config.terms)];
        
        const mileages = config.mileages === 'ALL'
          ? [5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000]
          : [Number(config.mileages)];

        for (const term of terms) {
          for (const mileage of mileages) {
            try {
              const quote = await this.calculateQuote({
                vehicle: variantData,
                term,
                annualMileage: mileage,
                maintenance: config.maintenance,
                deposit: config.deposit
              });

              results.push({
                success: true,
                quote: quote
              });

              // Rate limiting - 2 requests per second
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
              console.error(`Drivalia API: Quote error for ${vehicle.make} ${vehicle.model} ${term}m ${mileage}mi:`, error);
              results.push({
                success: false,
                vehicle: vehicle,
                config: { term, mileage, maintenance: config.maintenance },
                error: error.message
              });
            }
          }
        }

      } catch (error) {
        console.error(`Drivalia API: Vehicle lookup error for ${vehicle.make} ${vehicle.model}:`, error);
        results.push({
          success: false,
          vehicle,
          error: error.message
        });
      }
    }

    console.log(`Drivalia API: Batch complete. ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  // Keep session alive
  async keepAlive() {
    try {
      await this.fetch('/poll');
      return true;
    } catch (error) {
      console.warn('Drivalia API: Keep alive failed:', error);
      return false;
    }
  }
}

module.exports = { DrivaliaAPI };