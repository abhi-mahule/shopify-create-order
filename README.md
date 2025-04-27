# Shopify Create Order

A Node.js script that creates an order in Shopify with:
- Random customer selection
- Random product selection with available inventory
- One quantity of the product

## Features

- Uses the Shopify Admin GraphQL API
- Selects a random customer from your store
- Selects a random product that has available inventory
- Creates a draft order
- Completes the draft order to create a real order
- Detailed output of the created order

## Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Shopify store with API access
- Store must have at least one customer and product with inventory

## Installation

1. Clone this repository
2. Install dependencies:
```
npm install
```

3. Create a `.env` file in the root directory with your Shopify credentials:
```
SHOP_URL=your-store.myshopify.com
ACCESS_TOKEN=your-access-token
API_VERSION=2025-04
```

## Usage

1. Build the TypeScript code:
```
npm run build
```

2. Run the script:
```
npm start
```

The script will:
1. Fetch and select a random customer
2. Fetch and select a random product with available inventory
3. Create a draft order
4. Complete the draft order to create a real order
5. Output the details of the created order

## Notes

- The script creates a paid order
- Only products with available inventory will be considered
- The script handles error cases and provides informative error messages 

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 