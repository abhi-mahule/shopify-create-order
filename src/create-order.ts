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
  defaultAddress?: Address | null;
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
          displayFinancialStatus: string;
          displayFulfillmentStatus: string;
        } | null;
      };
      userErrors: {
        field: string[];
        message: string;
      }[];
    };
  };
}

interface OrderFulfillmentCreateResponse {
  data: {
    fulfillmentCreate: {
      fulfillment: {
        id: string;
        displayStatus: string;
        trackingInfo: TrackingInfo[];
      } | null;
      userErrors: {
        field: string[];
        message: string;
      }[];
    };
  };
}

interface TrackingInfo {
  number: string;
  url: string;
  company: string;
}

interface Address {
  address1?: string;
  address2?: string | null;
  city?: string;
  province?: string | null;
  provinceCode?: string | null;
  zip?: string;
  country?: string;
  countryCode?: string;
  phone?: string | null;
  firstName?: string;
  lastName?: string;
  company?: string | null;
}

// Payment status types for Shopify orders
type OrderPaymentStatus = 'PAID' | 'PENDING' | 'PARTIALLY_PAID' | 'UNPAID';

// Fulfillment status types for Shopify orders
type OrderFulfillmentStatus = 'FULFILLED' | 'PARTIALLY_FULFILLED' | 'UNFULFILLED' | 'PENDING_FULFILLMENT' | 'RESTOCKED';

// Delivery status types
type DeliveryStatus = 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'ATTEMPTED_DELIVERY' | 'DELIVERED' | 'DELAYED' | 'NOT_SHIPPED';

// Shipping carriers
type ShippingCarrier = 'UPS' | 'USPS' | 'FEDEX' | 'DHL' | 'ONTRAC';

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
 * Generates a random payment status for an order
 */
function getRandomPaymentStatus(): {status: OrderPaymentStatus, paymentPending: boolean} {
  const statuses: OrderPaymentStatus[] = ['PAID', 'PENDING', 'PARTIALLY_PAID', 'UNPAID'];
  const randomIndex = Math.floor(Math.random() * statuses.length);
  const status = statuses[randomIndex];
  
  // For the draftOrderComplete mutation, we need to use paymentPending parameter
  // True means PENDING, false means PAID
  // But for PARTIALLY_PAID and UNPAID, we need to handle differently
  let paymentPending: boolean = false;
  
  switch(status) {
    case 'PAID':
      paymentPending = false;
      break;
    case 'PENDING':
      paymentPending = true;
      break;
    case 'PARTIALLY_PAID':
    case 'UNPAID':
      // For these statuses, we'll set to pending and then might need 
      // to handle with additional mutations if needed
      paymentPending = true;
      break;
  }
  
  return { status, paymentPending };
}

/**
 * Generates a random fulfillment status for an order
 */
function getRandomFulfillmentStatus(): OrderFulfillmentStatus {
  const statuses: OrderFulfillmentStatus[] = [
    'FULFILLED', 
    'PARTIALLY_FULFILLED', 
    'UNFULFILLED', 
    'PENDING_FULFILLMENT', 
    'RESTOCKED'
  ];
  const randomIndex = Math.floor(Math.random() * statuses.length);
  return statuses[randomIndex];
}

/**
 * Generates a random delivery status based on fulfillment status
 */
function getRandomDeliveryInfo(fulfillmentStatus: OrderFulfillmentStatus): {
  status: DeliveryStatus, 
  carrier: ShippingCarrier, 
  trackingNumber: string
} {
  // Delivery status depends on fulfillment status
  let availableStatuses: DeliveryStatus[] = [];
  
  switch(fulfillmentStatus) {
    case 'FULFILLED':
      availableStatuses = ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
      break;
    case 'PARTIALLY_FULFILLED':
      availableStatuses = ['IN_TRANSIT', 'DELAYED'];
      break;
    case 'UNFULFILLED':
    case 'RESTOCKED':
      availableStatuses = ['NOT_SHIPPED'];
      break;
    case 'PENDING_FULFILLMENT':
      availableStatuses = ['NOT_SHIPPED', 'DELAYED'];
      break;
  }
  
  // If no appropriate statuses are available, default to NOT_SHIPPED
  if (availableStatuses.length === 0) {
    availableStatuses = ['NOT_SHIPPED'];
  }
  
  // Select a random status from the available options
  const randomStatusIndex = Math.floor(Math.random() * availableStatuses.length);
  const status = availableStatuses[randomStatusIndex];
  
  // Only generate carrier and tracking info if there's actually a shipment
  let carrier: ShippingCarrier = 'USPS';
  let trackingNumber = '';
  
  if (status !== 'NOT_SHIPPED') {
    // Select a random carrier
    const carriers: ShippingCarrier[] = ['UPS', 'USPS', 'FEDEX', 'DHL', 'ONTRAC'];
    const randomCarrierIndex = Math.floor(Math.random() * carriers.length);
    carrier = carriers[randomCarrierIndex];
    
    // Generate a random tracking number
    trackingNumber = generateRandomTrackingNumber(carrier);
  }
  
  return {
    status,
    carrier,
    trackingNumber
  };
}

/**
 * Generates a random tracking number based on carrier format
 */
function generateRandomTrackingNumber(carrier: ShippingCarrier): string {
  // Generate different tracking number formats based on carrier
  switch(carrier) {
    case 'UPS':
      // UPS format: 1Z + 8 digits
      return `1Z${Math.floor(10000000 + Math.random() * 90000000)}`;
      
    case 'USPS':
      // USPS format: 20 digits
      return `9400${Math.floor(1000000000000000 + Math.random() * 9000000000000000)}`;
      
    case 'FEDEX':
      // FedEx format: 12 digits
      return `${Math.floor(100000000000 + Math.random() * 900000000000)}`;
      
    case 'DHL':
      // DHL format: 10 digits
      return `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      
    case 'ONTRAC':
      // OnTrac format: C + 14 digits
      return `C${Math.floor(10000000000000 + Math.random() * 90000000000000)}`;
      
    default:
      // Generic format
      return `TRK${Math.floor(1000000 + Math.random() * 9000000)}`;
  }
}

/**
 * Generates a random address
 */
function generateRandomAddress(customer: Customer): Address {
  // If the customer has a default address, use some of those details
  if (customer.defaultAddress) {
    return {
      ...customer.defaultAddress,
      firstName: customer.firstName,
      lastName: customer.lastName
    };
  }

  // City options
  const cities = [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 
    'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'
  ];
  
  // Street names
  const streetNames = [
    'Main St', 'Oak Ave', 'Maple Dr', 'Washington Blvd', 'Park Rd',
    'Cedar Ln', 'Lake View Dr', 'River Rd', 'Pine St', 'Elm St'
  ];
  
  // States
  const states = [
    { name: 'California', code: 'CA' },
    { name: 'New York', code: 'NY' },
    { name: 'Texas', code: 'TX' },
    { name: 'Florida', code: 'FL' },
    { name: 'Illinois', code: 'IL' },
    { name: 'Pennsylvania', code: 'PA' },
    { name: 'Ohio', code: 'OH' },
    { name: 'Georgia', code: 'GA' },
    { name: 'North Carolina', code: 'NC' },
    { name: 'Michigan', code: 'MI' }
  ];
  
  // Generate random numbers for address
  const streetNumber = Math.floor(100 + Math.random() * 9900);
  const zipCode = Math.floor(10000 + Math.random() * 90000).toString();
  
  // Select random city, street, and state
  const cityIndex = Math.floor(Math.random() * cities.length);
  const streetIndex = Math.floor(Math.random() * streetNames.length);
  const stateIndex = Math.floor(Math.random() * states.length);
  
  // Generate a random 10-digit phone number
  const areaCode = Math.floor(200 + Math.random() * 800).toString();
  const firstPart = Math.floor(200 + Math.random() * 800).toString();
  const secondPart = Math.floor(1000 + Math.random() * 9000).toString();
  const phone = `${areaCode}-${firstPart}-${secondPart}`;
  
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    address1: `${streetNumber} ${streetNames[streetIndex]}`,
    address2: null,
    city: cities[cityIndex],
    province: states[stateIndex].name,
    provinceCode: states[stateIndex].code,
    zip: zipCode,
    country: 'United States',
    countryCode: 'US',
    phone,
    company: null
  };
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
            defaultAddress {
              address1
              address2
              city
              province
              provinceCode
              zip
              country
              countryCode
              phone
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
  
  // Generate shipping and billing addresses
  const shippingAddress = generateRandomAddress(customer);
  const billingAddress = { ...shippingAddress }; // Use same address for billing

  console.log('Shipping Address:');
  console.log(`${shippingAddress.firstName} ${shippingAddress.lastName}`);
  console.log(`${shippingAddress.address1}`);
  console.log(`${shippingAddress.city}, ${shippingAddress.province} ${shippingAddress.zip}`);
  console.log(`${shippingAddress.country}`);
  console.log(`Phone: ${shippingAddress.phone}`);
  
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
  
  // Create draft order without sending email notification
  // Shopify won't send any email until draftOrderInvoiceSend is called
  // By not calling draftOrderInvoiceSend, we prevent all notification emails
  const variables = {
    input: {
      customerId: customer.id,
      lineItems: [{
        variantId: variant.id,
        quantity: 1
      }],
      shippingAddress: shippingAddress,
      billingAddress: billingAddress
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
  console.log('Email notifications: Disabled (no invoice email will be sent)');
  return draftOrderId;
}

/**
 * Creates a fulfillment with tracking information
 */
async function createFulfillmentWithTracking(
  orderId: string, 
  fulfillmentStatus: OrderFulfillmentStatus,
  deliveryInfo: { status: DeliveryStatus, carrier: ShippingCarrier, trackingNumber: string }
): Promise<void> {
  // Only create fulfillment if appropriate based on the status
  if (
    fulfillmentStatus === 'UNFULFILLED' || 
    fulfillmentStatus === 'RESTOCKED' || 
    deliveryInfo.status === 'NOT_SHIPPED'
  ) {
    console.log('Order not fulfilled or shipped - skipping tracking information');
    return;
  }
  
  console.log(`Adding tracking information: ${deliveryInfo.carrier} - ${deliveryInfo.trackingNumber} (${deliveryInfo.status})`);
  
  // In a real implementation, we would add the tracking information here
  // using the fulfillmentCreate mutation
  // For simplicity, we're just logging the tracking info
}

/**
 * Completes a draft order to create a real order
 */
async function completeDraftOrder(draftOrderId: string): Promise<{
  orderId: string, 
  paymentStatus: OrderPaymentStatus,
  fulfillmentStatus: OrderFulfillmentStatus,
  actualFulfillmentStatus: string,
  deliveryInfo: {
    status: DeliveryStatus,
    carrier: ShippingCarrier,
    trackingNumber: string
  }
}> {
  console.log(`Completing draft order: ${draftOrderId}...`);
  
  // Get random payment status
  const { status: paymentStatus, paymentPending } = getRandomPaymentStatus();
  console.log(`Setting payment status: ${paymentStatus} (paymentPending: ${paymentPending})`);
  
  // Get random fulfillment status
  const fulfillmentStatus = getRandomFulfillmentStatus();
  console.log(`Selected fulfillment status: ${fulfillmentStatus}`);
  
  // Get random delivery status based on fulfillment status
  const deliveryInfo = getRandomDeliveryInfo(fulfillmentStatus);
  console.log(`Selected delivery status: ${deliveryInfo.status}`);
  
  const mutation = `
    mutation draftOrderComplete($id: ID!, $paymentPending: Boolean!) {
      draftOrderComplete(id: $id, paymentPending: $paymentPending) {
        draftOrder {
          id
          order {
            id
            name
            displayFinancialStatus
            displayFulfillmentStatus
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
    paymentPending: paymentPending
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
  const actualFinancialStatus = response.data.draftOrderComplete.draftOrder.order.displayFinancialStatus || paymentStatus;
  const actualFulfillmentStatus = response.data.draftOrderComplete.draftOrder.order.displayFulfillmentStatus || "UNFULFILLED";
  
  console.log(`Created order: ${orderName} (${orderId})`);
  console.log(`Payment status: ${actualFinancialStatus}`);
  console.log(`Fulfillment status: ${actualFulfillmentStatus}`);
  console.log(`Email notifications: Disabled`);
  
  // Add tracking information if appropriate
  await createFulfillmentWithTracking(orderId, fulfillmentStatus, deliveryInfo);
  
  return { 
    orderId, 
    paymentStatus, 
    fulfillmentStatus,
    actualFulfillmentStatus,
    deliveryInfo
  };
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
    const { orderId, paymentStatus, fulfillmentStatus, actualFulfillmentStatus, deliveryInfo } = await completeDraftOrder(draftOrderId);
    
    console.log('\n=============================================');
    console.log('ORDER CREATION SUCCESSFUL');
    console.log('=============================================');
    console.log(`Customer: ${customer.firstName} ${customer.lastName}`);
    console.log(`Email: ${customer.email}`);
    console.log(`Product: ${product.title} - ${variant.title}`);
    console.log(`Price: ${variant.price}`);
    console.log(`Order ID: ${orderId}`);
    console.log(`Payment Status: ${paymentStatus}`);
    console.log(`Fulfillment Status: ${fulfillmentStatus} (${actualFulfillmentStatus})`);
    console.log(`\nDELIVERY INFORMATION:`);
    console.log(`Status: ${deliveryInfo.status}`);
    
    if (deliveryInfo.status !== 'NOT_SHIPPED') {
      console.log(`Carrier: ${deliveryInfo.carrier}`);
      console.log(`Tracking Number: ${deliveryInfo.trackingNumber}`);
    }
    
    console.log('=============================================');
    console.log('Note: Delivery status and tracking information is simulated in this implementation.');
    
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