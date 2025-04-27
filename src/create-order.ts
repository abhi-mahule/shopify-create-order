import axios, { AxiosResponse } from 'axios';
import * as dotenv from 'dotenv';

// Initialize environment variables
dotenv.config();

// Define interfaces for Shopify GraphQL response types
interface Money {
  amount: string;
  currencyCode: string;
}

interface MoneyInput {
  amount: number;
  currencyCode: string;
}

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface CustomerEdge {
  node: Customer;
}

interface CustomerConnection {
  edges: CustomerEdge[];
}

interface ProductVariant {
  id: string;
  title: string;
  price: string;
  inventoryQuantity: number;
  sku: string | null;
}

interface ProductVariantEdge {
  node: ProductVariant;
}

interface ProductVariantConnection {
  edges: ProductVariantEdge[];
}

interface Product {
  id: string;
  title: string;
  variants: ProductVariantConnection;
}

interface ProductEdge {
  node: Product;
}

interface ProductConnection {
  edges: ProductEdge[];
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface CustomerQueryResponse {
  data: {
    customers: {
      edges: CustomerEdge[];
      pageInfo: PageInfo;
    };
  };
}

interface ProductQueryResponse {
  data: {
    products: {
      edges: ProductEdge[];
      pageInfo: PageInfo;
    };
  };
}

interface DraftOrderCreateResponse {
  data: {
    draftOrderCreate: {
      draftOrder: {
        id: string;
        name: string;
        totalPrice: string;
      };
      userErrors: {
        field: string[];
        message: string;
      }[];
    };
  };
}

interface OrderCreateFromDraftResponse {
  data: {
    draftOrderComplete: {
      draftOrder: {
        id: string;
        order: {
          id: string;
          name: string;
        } | null;
      };
      userErrors: {
        field: string[];
        message: string;
      }[];
    };
  };
}

// Shopify credentials from environment variables with validation
const SHOP_URL = process.env.SHOP_URL;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const API_VERSION = process.env.API_VERSION || '2025-04'; // Default to latest version if not specified

// Check for required environment variables
if (!SHOP_URL || !ACCESS_TOKEN) {
  console.error('Error: Missing required environment variables.');
  console.error('Please make sure SHOP_URL and ACCESS_TOKEN are set in your .env file.');
  process.exit(1);
}

/**
 * Makes a GraphQL request to Shopify
 */
async function makeShopifyGraphQLRequest(query: string, variables?: any): Promise<any> {
  try {
    const response = await axios({
      url: `https://${SHOP_URL}/admin/api/${API_VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': ACCESS_TOKEN as string
      },
      data: { 
        query,
        variables
      }
    });
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error('GraphQL error:', error.response.data);
      throw new Error(`GraphQL request failed: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Fetches random customer from Shopify
 */
async function fetchRandomCustomer(): Promise<Customer> {
  console.log('Fetching random customer...');
  
  const query = `
    query {
      customers(first: 25) {
        edges {
          node {
            id
            firstName
            lastName
            email
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  
  const response = await makeShopifyGraphQLRequest(query) as CustomerQueryResponse;
  
  if (!response.data?.customers?.edges || response.data.customers.edges.length === 0) {
    throw new Error('No customers found in the store');
  }
  
  // Choose a random customer
  const customers = response.data.customers.edges;
  const randomCustomerIndex = Math.floor(Math.random() * customers.length);
  const randomCustomer = customers[randomCustomerIndex].node;
  
  console.log(`Selected customer: ${randomCustomer.firstName} ${randomCustomer.lastName} (${randomCustomer.email})`);
  return randomCustomer;
}

/**
 * Fetches random product with available inventory from Shopify
 */
async function fetchRandomProduct(): Promise<{ product: Product, variant: ProductVariant }> {
  console.log('Fetching random product...');
  
  const query = `
    query {
      products(first: 25, sortKey: TITLE) {
        edges {
          node {
            id
            title
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  price
                  inventoryQuantity
                  sku
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  
  const response = await makeShopifyGraphQLRequest(query) as ProductQueryResponse;
  
  if (!response.data?.products?.edges || response.data.products.edges.length === 0) {
    throw new Error('No products found in the store');
  }
  
  // Filter products with available variants and inventory
  const productsWithInventory = response.data.products.edges
    .map(edge => edge.node)
    .filter(product => 
      product.variants.edges.length > 0 && 
      product.variants.edges.some(v => v.node.inventoryQuantity > 0)
    );
  
  if (productsWithInventory.length === 0) {
    throw new Error('No products with available inventory found');
  }
  
  // Choose a random product
  const randomProductIndex = Math.floor(Math.random() * productsWithInventory.length);
  const randomProduct = productsWithInventory[randomProductIndex];
  
  // Get variants with inventory
  const availableVariants = randomProduct.variants.edges
    .map(edge => edge.node)
    .filter(variant => variant.inventoryQuantity > 0);
  
  // Choose a random variant
  const randomVariantIndex = Math.floor(Math.random() * availableVariants.length);
  const randomVariant = availableVariants[randomVariantIndex];
  
  console.log(`Selected product: ${randomProduct.title} - ${randomVariant.title} (${randomVariant.price})`);
  return { product: randomProduct, variant: randomVariant };
}

/**
 * Creates a draft order in Shopify
 */
async function createDraftOrder(customer: Customer, variant: ProductVariant): Promise<string> {
  console.log('Creating draft order...');
  
  const mutation = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          totalPrice
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const variables = {
    input: {
      customerId: customer.id,
      lineItems: [{
        variantId: variant.id,
        quantity: 1
      }],
      tags: ["API", "Automated Order"]
    }
  };
  
  const response = await makeShopifyGraphQLRequest(mutation, variables) as DraftOrderCreateResponse;
  
  // Check for errors
  if (response.data.draftOrderCreate.userErrors && response.data.draftOrderCreate.userErrors.length > 0) {
    throw new Error(`Failed to create draft order: ${JSON.stringify(response.data.draftOrderCreate.userErrors)}`);
  }
  
  const draftOrderId = response.data.draftOrderCreate.draftOrder.id;
  const draftOrderName = response.data.draftOrderCreate.draftOrder.name;
  const totalPrice = response.data.draftOrderCreate.draftOrder.totalPrice;
  
  console.log(`Created draft order: ${draftOrderName} (${draftOrderId}) with total price: ${totalPrice}`);
  return draftOrderId;
}

/**
 * Completes a draft order to create a real order
 */
async function completeDraftOrder(draftOrderId: string): Promise<string> {
  console.log(`Completing draft order: ${draftOrderId}...`);
  
  const mutation = `
    mutation draftOrderComplete($id: ID!, $paymentPending: Boolean!) {
      draftOrderComplete(id: $id, paymentPending: $paymentPending) {
        draftOrder {
          id
          order {
            id
            name
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const variables = {
    id: draftOrderId,
    paymentPending: false // Mark as paid
  };
  
  const response = await makeShopifyGraphQLRequest(mutation, variables) as OrderCreateFromDraftResponse;
  
  // Check for errors
  if (response.data.draftOrderComplete.userErrors && response.data.draftOrderComplete.userErrors.length > 0) {
    throw new Error(`Failed to complete draft order: ${JSON.stringify(response.data.draftOrderComplete.userErrors)}`);
  }
  
  if (!response.data.draftOrderComplete.draftOrder.order) {
    throw new Error('Draft order was completed but no order was created');
  }
  
  const orderId = response.data.draftOrderComplete.draftOrder.order.id;
  const orderName = response.data.draftOrderComplete.draftOrder.order.name;
  
  console.log(`Created order: ${orderName} (${orderId})`);
  return orderId;
}

/**
 * Main function to create an order with random product and customer
 */
async function createRandomOrder(): Promise<void> {
  try {
    console.log(`Creating a random order in Shopify store: ${SHOP_URL}`);
    
    // 1. Fetch random customer
    const customer = await fetchRandomCustomer();
    
    // 2. Fetch random product with inventory
    const { product, variant } = await fetchRandomProduct();
    
    // 3. Create a draft order
    const draftOrderId = await createDraftOrder(customer, variant);
    
    // 4. Complete the draft order to create a real order
    const orderId = await completeDraftOrder(draftOrderId);
    
    console.log('\n=============================================');
    console.log('ORDER CREATION SUCCESSFUL');
    console.log('=============================================');
    console.log(`Customer: ${customer.firstName} ${customer.lastName}`);
    console.log(`Email: ${customer.email}`);
    console.log(`Product: ${product.title} - ${variant.title}`);
    console.log(`Price: ${variant.price}`);
    console.log(`Order ID: ${orderId}`);
    console.log('=============================================');
    
  } catch (error) {
    console.error('Error creating order:');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error('Unknown error occurred');
    }
    process.exit(1);
  }
}

// Execute the function
createRandomOrder(); 