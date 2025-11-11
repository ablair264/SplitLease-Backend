// ========================================
// LEX AUTOLEASE - DIRECT API AUTOMATION
// ========================================

class LexAutoQuoteAutomation {
    constructor() {
        this.csrf_token = window.csrf_token;
        this.profile = window.profile;
        this.baseUrl = 'https://associate.lexautolease.co.uk';
    }

    /**
     * Call a Lex Autolease service endpoint
     */
    async callService(serviceName, functionName, data) {
        const url = `${this.baseUrl}/services/${serviceName}.svc/${functionName}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'x-csrf-check': this.csrf_token
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`API Error: ${error.Message || response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Get variant details including CO2
     */
    async getVariantDetails(makeId, modelId, variantId) {
        return await this.callService('Quote', 'GetVariant', {
            manufacturerId: makeId,
            modelId: modelId,
            variantId: variantId
        });
    }

    /**
     * Get available contract types
     */
    async getContractTypes(paymentPlanId = '', specialOfferId = 0) {
        return await this.callService('Quote', 'GetContractTypes', {
            paymentPlanId: paymentPlanId,
            specialOfferId: specialOfferId
        });
    }

    /**
     * Get payment plans for a contract type
     */
    async getPaymentPlans(contractTypeId) {
        return await this.callService('Quote', 'GetPaymentPlans', {
            contractTypeId: contractTypeId
        });
    }

    /**
     * Get optional extras
     */
    async getOptionalExtras(makeId, modelId, variantId, contractTypeId, term, mileage) {
        return await this.callService('Quote', 'GetOptions', {
            manufacturerId: makeId,
            modelId: modelId,
            variantId: variantId,
            lineNo: 0,
            contractTypeId: contractTypeId,
            term: term,
            mileage: mileage
        });
    }

    /**
     * Build a quote line object
     */
    buildQuoteLine({
        makeId,
        modelId,
        variantId,
        term,
        mileage,
        contractTypeId,
        discountType = 'system',
        discountPercent = null,
        discountPound = null,
        maintenance = false,
        optionalExtras = []
    }) {
        const totalMileage = parseInt(term) * parseInt(mileage);
        
        // Calculate dealer discount
        let dealerDiscount = "-1";
        if (discountType === 'custom') {
            if (discountPercent !== null) {
                dealerDiscount = discountPercent.toString();
            } else if (discountPound !== null) {
                // Would need to convert £ to % based on vehicle price
                dealerDiscount = discountPercent.toString();
            }
        } else {
            // System discount uses profile default
            dealerDiscount = this.profile.Discount || "-1";
        }

        return {
            LineNo: 0,
            Term: term.toString(),
            Mileage: mileage.toString(),
            TotalMileage: totalMileage.toString(),
            BrokerOTRP: "",
            Commission: this.profile.SalesCode || "000000000",
            ContractTypeId: contractTypeId.toString(),
            BonusExcluded: false,
            OffInvSupport: "",
            DealerDiscount: dealerDiscount,
            ModelId: modelId.toString(),
            VariantId: variantId.toString(),
            ManufacturerId: makeId.toString(),
            SpecialOfferDetail: {
                OfferId: 0,
                SpecialOfferTypeId: 0,
                TrimColourId: 0
            },
            OptionalExtras: optionalExtras,
            Deposit: "-1",
            EstimatedSaleValue: "-1",
            InitialPayment: "-1",
            FRFExcluded: false,
            RegulatedAgreementOnly: false
        };
    }

    /**
     * Build a calculate request object
     */
    buildCalculateRequest(quoteLine, paymentPlanId = '') {
        return {
            RVCode: this.profile.RVCode || "00",
            PaymentPlanId: paymentPlanId,
            CustomerRef: "",
            IsRentalRollback: false,
            TargetRental: 0,
            RollbackField: "",
            ActiveLine: quoteLine,
            IsSpecialOfferVehicle: false,
            AnticipatedDeliveryDate: null,
            WLTPCo2: "",
            SelectedLineNo: 0,
            IsWLTPCo2: false,
            PartnerId: "",
            GenerateQuoteNumber: this.profile.Role === "LBS"
        };
    }

    /**
     * Calculate a quote
     */
    async calculateQuote(calcRequest) {
        return await this.callService('Quote', 'CalculateQuote', {
            calcrequest: calcRequest
        });
    }

    /**
     * Get quote results
     */
    async getQuote() {
        return await this.callService('Quote', 'GetQuote', {});
    }

    /**
     * Main automation function - runs a complete quote
     */
    async runQuote({
        makeId,
        modelId,
        variantId,
        term,
        mileage,
        discountType = 'system',
        discountPercent = null,
        discountPound = null,
        maintenance = false,
        contractTypeId = null,
        paymentPlanId = ''
    }) {
        try {
            console.log('🚀 Starting quote automation...');
            
            // Step 1: Get variant details (includes CO2)
            console.log('📊 Fetching variant details...');
            const variantDetails = await this.getVariantDetails(makeId, modelId, variantId);
            console.log(`✅ Variant CO2: ${variantDetails.CO2}`);

            // Step 2: Get contract types if not provided
            if (!contractTypeId) {
                console.log('📋 Fetching contract types...');
                const contractTypes = await this.getContractTypes(paymentPlanId);
                contractTypeId = contractTypes[0].Key; // Use first available
                console.log(`✅ Using contract type: ${contractTypeId}`);
            }

            // Step 3: Get optional extras (for maintenance)
            let optionalExtras = [];
            if (maintenance) {
                console.log('🔧 Fetching optional extras...');
                const extras = await this.getOptionalExtras(
                    makeId, modelId, variantId, 
                    contractTypeId, term, mileage
                );
                
                // Find maintenance extra
                const maintenanceExtra = extras.find(e => 
                    e.Description.toLowerCase().includes('maintenance') ||
                    e.Description.toLowerCase().includes('service')
                );
                
                if (maintenanceExtra) {
                    optionalExtras.push({
                        Value: maintenanceExtra.Key,
                        IsSelected: true,
                        Quantity: 1,
                        ListPrice: maintenanceExtra.ListPrice,
                        FFOCode: maintenanceExtra.FFOCode,
                        Description: maintenanceExtra.Description,
                        IsThirdParty: false,
                        IsPreferredOptionManual: false
                    });
                    console.log(`✅ Added maintenance: ${maintenanceExtra.Description}`);
                }
            }

            // Step 4: Build quote line
            console.log('📝 Building quote line...');
            const quoteLine = this.buildQuoteLine({
                makeId,
                modelId,
                variantId,
                term,
                mileage,
                contractTypeId,
                discountType,
                discountPercent,
                discountPound,
                maintenance,
                optionalExtras
            });

            // Step 5: Build calculate request
            const calcRequest = this.buildCalculateRequest(quoteLine, paymentPlanId);

            // Step 6: Calculate quote
            console.log('💰 Calculating quote...');
            const result = await this.calculateQuote(calcRequest);

            if (result.Success) {
                console.log('✅ Quote calculated successfully!');
                console.log(`Quote ID: ${result.QuoteId}`);
                console.log(`Line Numbers: ${result.LineNumbers.join(', ')}`);
                
                // Step 7: Get full quote details
                console.log('📥 Fetching quote details...');
                const quoteDetails = await this.getQuote();
                
                return {
                    success: true,
                    quoteId: result.QuoteId,
                    lineNumbers: result.LineNumbers,
                    variantCO2: variantDetails.CO2,
                    quoteDetails: quoteDetails,
                    message: result.Message
                };
            } else {
                throw new Error('Quote calculation failed');
            }

        } catch (error) {
            console.error('❌ Quote automation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Run multiple quotes in sequence (for different terms/mileages)
     */
    async runMultipleQuotes(vehicles) {
        const results = [];
        
        for (const vehicle of vehicles) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`Processing: ${vehicle.make} ${vehicle.model} ${vehicle.variant}`);
            console.log(`Term: ${vehicle.term}, Mileage: ${vehicle.mileage}`);
            console.log('='.repeat(60));
            
            const result = await this.runQuote(vehicle);
            results.push({
                ...vehicle,
                result: result
            });
            
            // Add delay between quotes to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        return results;
    }

    /**
     * Extract pricing from quote results
     */
    extractPricing(quoteDetails, lineNumber) {
        const variant = quoteDetails.Variants.find(v => v.LineNo === lineNumber);
        if (!variant) return null;

        return {
            lineNumber: variant.LineNo,
            manufacturerName: variant.ManufacturerName,
            modelName: variant.ModelName,
            variantName: variant.VariantName,
            term: variant.Term,
            mileage: variant.Mileage,
            monthlyRental: variant.MonthlyRental,
            initialRental: variant.InitialRental,
            totalCost: variant.TotalCost,
            co2: variant.CO2,
            fuelType: variant.FuelType,
            p11d: variant.P11D,
            vat: variant.VAT,
            status: variant.Status
        };
    }
}

// ========================================
// USAGE EXAMPLES
// ========================================

// Example 1: Single Quote
async function exampleSingleQuote() {
    const automation = new LexAutoQuoteAutomation();
    
    const result = await automation.runQuote({
        makeId: "75",        // ABARTH
        modelId: "1",        // 500
        variantId: "19",     // Specific variant
        term: "36",          // 36 months
        mileage: "10000",    // 10,000 miles per year
        discountType: 'system',
        maintenance: true
    });
    
    console.log('Result:', result);
}

// Example 2: Multiple Terms/Mileages for Same Vehicle
async function exampleMultipleTerms() {
    const automation = new LexAutoQuoteAutomation();
    
    const vehicles = [
        {
            make: 'ABARTH',
            model: '500',
            variant: 'Electric Cabrio',
            makeId: "75",
            modelId: "1",
            variantId: "19",
            term: "24",
            mileage: "8000",
            discountType: 'system',
            maintenance: true
        },
        {
            make: 'ABARTH',
            model: '500',
            variant: 'Electric Cabrio',
            makeId: "75",
            modelId: "1",
            variantId: "19",
            term: "36",
            mileage: "10000",
            discountType: 'system',
            maintenance: true
        },
        {
            make: 'ABARTH',
            model: '500',
            variant: 'Electric Cabrio',
            makeId: "75",
            modelId: "1",
            variantId: "19",
            term: "48",
            mileage: "12000",
            discountType: 'system',
            maintenance: false
        }
    ];
    
    const results = await automation.runMultipleQuotes(vehicles);
    console.log('All Results:', results);
}

// Example 3: Get CO2 Only
async function exampleGetCO2() {
    const automation = new LexAutoQuoteAutomation();
    
    const variantDetails = await automation.getVariantDetails("75", "1", "19");
    console.log('CO2:', variantDetails.CO2);
    console.log('Fuel Type:', variantDetails.FuelType);
    console.log('P11D:', variantDetails.P11D);
}

// ========================================
// EXPORT FOR USE
// ========================================
window.LexAutoQuoteAutomation = LexAutoQuoteAutomation;
console.log('✅ Lex Autolease Automation loaded!');
console.log('Usage: const automation = new LexAutoQuoteAutomation();');
