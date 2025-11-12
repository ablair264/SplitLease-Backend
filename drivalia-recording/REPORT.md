# Drivalia Flow Recording Report

**Recorded at:** 2025-11-12T15:34:55.917Z

**Total steps:** 29
**Screenshots:** 2
**Network calls:** 146
**Page transitions:** 5

## Page Transitions

1. https://www.caafgenus3.co.uk/WebApp/
2. https://www.caafgenus3.co.uk/WebApp/
3. https://www.caafgenus3.co.uk/WebApp/fmoportal/index.html#/login
4. https://www.caafgenus3.co.uk/WebApp/fmoportal/index.html#/dashboard
5. https://www.caafgenus3.co.uk/WebApp/fmoportal/index.html#/quoting/new

## Captured Page States

### Step 1: Initial page load

**URL:** https://www.caafgenus3.co.uk/WebApp/
**Hash:** 

### Step 2: Final state after quote

**URL:** https://www.caafgenus3.co.uk/WebApp/fmoportal/index.html#/quoting/new
**Hash:** #/quoting/new

#### Visible Inputs:

- **input** - name: `null`, id: `null`, placeholder: "search for quotes etc"
  - data-hook: "banner.smartsearch"
- **input** - name: `numberInAdvanceFinance`, id: `1188`, placeholder: "null"
  - data-hook: "quoting.finance.config.noinadvancefinancier"
  - ng-model: "config.data.numberInAdvanceFinance"
- **input** - name: `null`, id: `calcfield-1110`, placeholder: "null"
  - data-hook: "quoting.finance.grosscost"
  - ng-model: "assets.summary.total.gross"
- **input** - name: `null`, id: `calcfield-1117`, placeholder: "null"
  - data-hook: "quoting.finance.netcost"
  - ng-model: "assets.summary.total.net"
- **input** - name: `null`, id: `calcfield-948`, placeholder: "null"
  - data-hook: "quoting.finance.amountFinanced"
  - ng-model: "vm.calculation.parameters.amountFinanced"
- **input** - name: `term`, id: `calcfield-954`, placeholder: "null"
  - data-hook: "quoting.finance.term"
  - ng-model: "vm.calculation.parameters.term"
- **input** - name: `null`, id: `calcfield-938`, placeholder: "null"
  - data-hook: "quoting.finance.payment"
  - ng-model: "displayOnly.payment"
- **input** - name: `annualMileage`, id: `calcfield-1131`, placeholder: "null"
  - data-hook: "quoting.finance.annualmileage"
  - ng-model: "vm.calculation.parameters.assetMeterUsage.multiplicandMeterUsage"
- **input** - name: `null`, id: `calcfield-1137`, placeholder: "null"
  - data-hook: "quoting.finance.plan"
  - ng-model: "vm.calculation.parameters.plan"
- **input** - name: `null`, id: `mat-input-27`, placeholder: "null"
  - data-hook: "vaps.item.customerPremium"

#### Angular Material Selects:

- id: `mat-select-22`, aria-label: "null"

#### Visible Buttons:

- "Search" - type: `button`
- "search Find" - type: `button`
  - data-hook: "quoting.customer.find"
- " Change" - type: `button`
  - data-hook: "quoting.asset.change"
- "Select a Product" - type: `button`
  - data-hook: "quoting.finance.product-select"
- " Recalculate" - type: `button`
  - data-hook: "quoting.finance.recalculate"
- "
                            Reset" - type: `button`
  - data-hook: "quoting.finance.resetDefaults"
- " Save Quote" - type: `button`
  - data-hook: "save"
- " Print" - type: `button`
  - data-hook: "quoteEmailOrPrint"
- " Side-by-side" - type: `button`
  - data-hook: "sideBySide"
- " Propose" - type: `button`
  - data-hook: "propose"


## Quote Results Found

**Price elements:** 26

1. **£34,045.60**
   - Selector: `[class*="price"]`
   - Class: `cui-vehicle-ticket__price ng-binding ng-scope`

2. **Monthly
    
        
            1
            £3,616.70
        
            23
            £602.78**
   - Selector: `[class*="payment"]`
   - Class: `offer-summary__schedule cui-payment-schedule`

3. **Monthly
    
        
            1
            £3,616.70
        
            23
            £602.78**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule`

4. **1
            £3,616.70
        
            23
            £602.78**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__list`

5. **1
            £3,616.70**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__item ng-scope`

6. **£3,616.70**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__value ng-binding`

7. **23
            £602.78**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__item ng-scope cui-payment-schedule__item--headline`

8. **£602.78**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__value ng-binding`

9. **1  £3,013.9223  £502.32**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule`

10. **1  £3,013.9223  £502.32**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__list`

11. **1  £3,013.92**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__item ng-star-inserted`

12. **£3,013.92**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__value`

13. **23  £502.32**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__item cui-payment-schedule__item--headline ng-star-inserted`

14. **£502.32**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__value`

15. **1  £3,315.3123  £552.55**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule`

16. **1  £3,315.3123  £552.55**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__list`

17. **1  £3,315.31**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__item ng-star-inserted`

18. **£3,315.31**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__value`

19. **23  £552.55**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__item cui-payment-schedule__item--headline ng-star-inserted`

20. **£552.55**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__value`

21. **1  £3,616.7023  £602.78**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule`

22. **1  £3,616.7023  £602.78**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__list`

23. **1  £3,616.70**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__item ng-star-inserted`

24. **£3,616.70**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__value`

25. **23  £602.78**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__item cui-payment-schedule__item--headline ng-star-inserted`

26. **£602.78**
   - Selector: `[class*="payment"]`
   - Class: `cui-payment-schedule__value`


**All price-like text found on page:**

- £34,045.60
- £31,633.33
- £6,326.67
- £37,960.00
- £4,428.66
- £885.74
- £5,314.40
- £27,204.67
- £5,440.93
- £32,645.60
- £1,265.83
- £134.17
- £1,400.00
- £28,470.50
- £5,575.10
- £34,045.60
- £250.00
- £208.33
- £1,450.00
- £1,208.33

## Key Network Calls

1. **GET** https://www.caafgenus3.co.uk/WebApp/api/actuator/info
2. **GET** https://www.caafgenus3.co.uk/WebApp/api/user/data/session
3. **POST** https://www.caafgenus3.co.uk/WebApp/api/lang/batch/EN
   - Body: `[{"identifier":"Screen/PP_LOGIN"},{"identifier":"Screen/PP_RESETPASSWORD"},{"identifier":"Screen/PP_CHANGEPASSWORD"},{"identifier":"Screen/PP_CHANGE_FORGOTTEN_PASSWORD"},{"identifier":"Screen/PP_MAIN"`
4. **GET** https://www.caafgenus3.co.uk/WebApp/api/actuator/info
5. **POST** https://www.caafgenus3.co.uk/WebApp/api/login
   - Body: `username=Ally%20Blair&password=9Mu@.5Qw2!XXtaF`
6. **GET** https://www.caafgenus3.co.uk/WebApp/api/user/data/session
7. **GET** https://www.caafgenus3.co.uk/WebApp/api/user/data/session
8. **POST** https://www.caafgenus3.co.uk/WebApp/api/lang/batch/EN
   - Body: `[{"identifier":"Screen/PP_MAIN"},{"identifier":"Status"},{"identifier":"MENU"}]`
9. **POST** https://www.caafgenus3.co.uk/WebApp/api/lang/batch/EN
   - Body: `[{"identifier":"Screen/PP_MAIN"},{"identifier":"Message/APP"}]`
10. **GET** https://www.caafgenus3.co.uk/WebApp/api/poll
11. **POST** https://www.caafgenus3.co.uk/WebApp/api/lang/batch/EN
   - Body: `[{"identifier":"Screen/PP_PROPOSAL_LINKER"},{"identifier":"Screen/PP_RECENT_BUSINESS"},{"identifier":"Screen/PP_LINKED_PROPOSALS"},{"identifier":"Screen/PP_COLLATERAL_SUMMARY"},{"identifier":"Screen/P`
12. **GET** https://www.caafgenus3.co.uk/WebApp/api/bulletins/recent?max=5
13. **GET** https://www.caafgenus3.co.uk/WebApp/api/menu/ppBurger
14. **GET** https://www.caafgenus3.co.uk/WebApp/api/profile
15. **GET** https://www.caafgenus3.co.uk/WebApp/api/menu/ppBurger
16. **GET** https://www.caafgenus3.co.uk/WebApp/api/form/experimental/PP_DEAL_SEARCH_FILTERS_FORM
17. **GET** https://www.caafgenus3.co.uk/WebApp/api/bulletins/recent?max=5
18. **GET** https://www.caafgenus3.co.uk/WebApp/api/proposalalerts/5
19. **GET** https://www.caafgenus3.co.uk/WebApp/api/recent/list
20. **GET** https://www.caafgenus3.co.uk/WebApp/api/recent/31978426
21. **GET** https://www.caafgenus3.co.uk/WebApp/api/recent/search/options
22. **POST** https://www.caafgenus3.co.uk/WebApp/api/lang/batch/EN
   - Body: `[{"identifier":"Screen/PP_UNSAVED_DIALOG"},{"identifier":"Screen/PP_ASSET_SEARCH"},{"identifier":"Screen/PP_QUOTING"},{"identifier":"Screen/PP_DPA"},{"identifier":"CATALOG_NODE"},{"identifier":"UDT/FU`
23. **POST** https://www.caafgenus3.co.uk/WebApp/api/lang/batch/EN
   - Body: `[{"identifier":"Screen/PP_QUOTING"},{"identifier":"Screen/PP_ADDRESS_POPUP"},{"identifier":"Screen/PP_SUPPLIER_POPUP"},{"identifier":"Screen/PP_CREATE_SUPPLIER_POPUP"},{"identifier":"Screen/PP_UNSAVED`
24. **POST** https://www.caafgenus3.co.uk/WebApp/api/lang/batch/EN
   - Body: `[{"identifier":"Screen/PP_SIDE_BY_SIDE_OPTION"},{"identifier":"UDT/SIDE_BY_SIDE_OPTION"}]`
25. **GET** https://www.caafgenus3.co.uk/WebApp/api/quote/
26. **GET** https://www.caafgenus3.co.uk/WebApp/api/propose/dpa
27. **GET** https://www.caafgenus3.co.uk/WebApp/api/form/PP_QUOTING_CUSTOMER_FORM_I/EN
28. **GET** https://www.caafgenus3.co.uk/WebApp/api/form/PP_CUSTOMER_FIND_FORM/EN
29. **POST** https://www.caafgenus3.co.uk/WebApp/api/lang/batch/EN
   - Body: `[{"identifier":"UDT/TITLE"}]`
30. **GET** https://www.caafgenus3.co.uk/WebApp/api/currency/list/CHANNEL_DBROKER
31. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
32. **GET** https://www.caafgenus3.co.uk/WebApp/api/form/PP_QUOTING_CUSTOMER_FORM_C/EN
33. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/init/
   - Body: `{"secondary":false,"currencySymbol":"£","data":{"asset":{"variant":null,"type":"N","behaviourType":"N","config":null,"finance":null,"bundling":null,"subAssets":null,"componentIdentifiers":null,"priceT`
34. **GET** https://www.caafgenus3.co.uk/WebApp/api/asset/new/makes/104
35. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/models
   - Body: `{"category":"104","type":"N","assetSearchFilters":{"makeId":31705,"technicalDetailFilters":{},"priceFrom":null,"priceTo":null,"showAdvancedFilters":false,"makeDrivenByYear":false}}`
36. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/search
   - Body: `{"category":"104","type":"N","assetSearchFilters":{"makeId":31705,"technicalDetailFilters":{},"priceFrom":null,"priceTo":null,"showAdvancedFilters":false,"makeDrivenByYear":false}}`
37. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
38. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/search
   - Body: `{"category":"104","type":"N","assetSearchFilters":{"makeId":31705,"technicalDetailFilters":{},"priceFrom":null,"priceTo":null,"showAdvancedFilters":false,"makeDrivenByYear":false,"modelId":129481}}`
39. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/search
   - Body: `{"category":"104","type":"N","assetSearchFilters":{"makeId":31705,"technicalDetailFilters":{},"priceFrom":null,"priceTo":null,"showAdvancedFilters":false,"makeDrivenByYear":false,"modelId":129481}}`
40. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/search
   - Body: `{"category":"104","type":"N","assetSearchFilters":{"makeId":31705,"technicalDetailFilters":{},"priceFrom":null,"priceTo":null,"showAdvancedFilters":false,"makeDrivenByYear":false,"modelId":129481}}`
41. **POST** https://www.caafgenus3.co.uk/WebApp/api/assetconfig/validate-asset-details
   - Body: `{"odometer":null,"registrationPlate":null,"registrationNumber":null,"registrationDate":null,"vin":null,"serialNumber":null,"customAttributes":{},"maxAssetAge":null,"appAssetSupplier":{"customFields":{`
42. **POST** https://www.caafgenus3.co.uk/WebApp/api/assetconfig/
   - Body: `{"type":"N","selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","modelYear":"2026","variantId":1254757,"variant":"2.0 TDI 150 Black Edition 4dr S Tronic (2026)"`
43. **POST** https://www.caafgenus3.co.uk/WebApp/api/product/
   - Body: `{"productAssets":[{"makeId":31705,"modelId":129481,"variant":1254757,"assetType":"N","assetCategory":"104","salePrice":37960,"regDate":null,"registrationPlate":null,"selectionMode":"STANDARD","quantit`
44. **GET** https://www.caafgenus3.co.uk/WebApp/api/form/PP_ASSET_PRICE_EXCHANGE_FORM/EN
45. **GET** https://www.caafgenus3.co.uk/WebApp/api/form/PP_QUOTING_ASSET_ADDRESS_FORM/EN
46. **GET** https://www.caafgenus3.co.uk/WebApp/api/form/PP_QUOTING_ASSET_SPECIFICS_FORM/EN
47. **GET** https://www.caafgenus3.co.uk/WebApp/api/form/PP_SETTLEMENT_QUOTE_FORM/EN
48. **POST** https://www.caafgenus3.co.uk/WebApp/api/assetconfig/summary/
   - Body: `{"asset":{"variant":null,"type":"N","behaviourType":"N","config":null,"finance":null,"bundling":null,"subAssets":null,"componentIdentifiers":null,"priceType":"gross","priceSetByUser":false,"visibility`
49. **POST** https://www.caafgenus3.co.uk/WebApp/api/product/change/
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
50. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
51. **POST** https://www.caafgenus3.co.uk/WebApp/api/product/updatefleetquotedetails
   - Body: `{"isLease":true,"assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","modelYea`
52. **POST** https://www.caafgenus3.co.uk/WebApp/api/residualdetails/getRvPercentageDetails
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
53. **POST** https://www.caafgenus3.co.uk/WebApp/api/residualdetails/getRvPercentageDetails
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
54. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
55. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
56. **POST** https://www.caafgenus3.co.uk/WebApp/api/residualdetails/getRvPercentageDetails
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
57. **POST** https://www.caafgenus3.co.uk/WebApp/api/calculate/
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
58. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
59. **POST** https://www.caafgenus3.co.uk/WebApp/api/residualdetails/getRvPercentageDetails
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
60. **POST** https://www.caafgenus3.co.uk/WebApp/api/residualdetails/getRvPercentageDetails
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
61. **POST** https://www.caafgenus3.co.uk/WebApp/api/calculate/
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
62. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
63. **POST** https://www.caafgenus3.co.uk/WebApp/api/residualdetails/getRvPercentageDetails
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
64. **POST** https://www.caafgenus3.co.uk/WebApp/api/calculate/
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
65. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
66. **POST** https://www.caafgenus3.co.uk/WebApp/api/calculate/
   - Body: `{"customerType":"C","assets":[{"type":"N","active":true,"displayAssetInactive":false,"variant":1254757,"selectedVariant":{"makeId":31705,"make":"AUDI","modelId":129481,"model":"A3 DIESEL SALOON","mode`
67. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
68. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/init/
   - Body: `{"secondary":false,"currencySymbol":"£","data":{"asset":{"variant":null,"type":"N","behaviourType":"N","config":null,"finance":null,"bundling":null,"subAssets":null,"componentIdentifiers":null,"priceT`
69. **GET** https://www.caafgenus3.co.uk/WebApp/api/asset/new/makes/104
70. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/models
   - Body: `{"category":"104","type":"N","assetSearchFilters":{"makeId":31705,"modelYear":null,"technicalDetailFilters":{},"priceFrom":null,"priceTo":null,"showAdvancedFilters":false,"makeDrivenByYear":false}}`
71. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/search
   - Body: `{"category":"104","type":"N","assetSearchFilters":{"modelId":129481,"makeId":31705,"modelYear":null,"technicalDetailFilters":{},"priceFrom":null,"priceTo":null,"showAdvancedFilters":false,"makeDrivenB`
72. **POST** https://www.caafgenus3.co.uk/WebApp/api/asset/search
   - Body: `{"category":"104","type":"N","assetSearchFilters":{"modelId":129481,"makeId":31705,"modelYear":null,"technicalDetailFilters":{},"priceFrom":null,"priceTo":null,"showAdvancedFilters":false,"makeDrivenB`
73. **POST** https://www.caafgenus3.co.uk/WebApp/api/poll
   - Body: `{"proposalId":null,"events":["SESSION_TIMEOUT","proposalLock","bulletins"]}`
