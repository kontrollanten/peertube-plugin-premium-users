import { test, expect, Page } from '@playwright/test';
import Stripe from 'stripe'

const PAGE_URL = 'http://localhost:9000'

const waitForVideoAndExpect = async (page: Page) => {
  await page.waitForSelector('video')

  await expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.03 })
}

const disableModals = async (page: Page) => {
  return page.route('**/api/v1/users/me', async route => {
    const response = await route.fetch()
    const body = await response.json()
    await route.fulfill({
      response,
      body: JSON.stringify({
        ...body,
        noAccountSetupWarningModal: true,
        noInstanceConfigWarningModal: true,
        noWelcomeModal: true
      }),
      headers: response.headers()
    })
  })
}

const waitUntilUserIsPremium = async (page: Page) => {
  const { origins } = await page.request.storageState()
  const { localStorage } = origins.find(o => o.origin.match(new RegExp(PAGE_URL))) || {}
  const { value: token } = localStorage?.find(s => s.name === 'access_token') || {}
  let subscriptionCreated = false

  const timeout = setTimeout(() => {
    expect(false, 'Expected /subscription endpoint to return HTTP status 200 within timeout.').toBe(true)
  }, 20000)

  while (!subscriptionCreated) {
    const response = await page.request.get(`${PAGE_URL}/plugins/premium-users/router/subscription`, {
      headers: {
        Authorization: 'Bearer ' + token
      }
    })

    if (response.ok()) {
      subscriptionCreated = true
      clearTimeout(timeout)
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

test.describe('anonymous user', () => {
  test('loads replacement video', async ({ page }) => {
    await page.goto(PAGE_URL);

    await page.getByText('Premium video').click()

    await waitForVideoAndExpect(page)

    await expect(page.innerHTML).not.toContain(/download/i)
  });
})

test.describe('authenticated user', () => {
  test.describe.configure({ mode: 'serial' });
  test.describe.configure({ timeout: 60000 }) // Increase timeout to handle Stripe checkout

  const TEST_ID = Math.round(Date.now() / 1000)
  const NAME = 'John Premium ' + TEST_ID
  const EMAIL = `john${TEST_ID}@premi.um`
  const PASSWORD = 'testtest'

  test.beforeEach(async ({ page }) => {
    await disableModals(page)
  })

  test('becomes a premium user', async ({ page }) => {
    await page.goto(PAGE_URL)

    await page.getByText('Become premium').click()

    await page.getByTestId('premium_users-button-create_account').click()

    await page.waitForURL(/signup/i)

    await page.getByRole('button', { name: 'Create an account' }).click()

    await page.getByText(/I am at least/i).click()
    await page.getByText(/go to the next step/i).click()

    await page.getByLabel(/public name/i).fill(NAME)
    await page.getByLabel(/email/i).fill(EMAIL)
    await page.getByLabel(/password/i).fill(PASSWORD)

    await page.getByText(/go to the next step/i).click()

    await page.getByText(/I don't want to create a channel/i).click()
    await page.waitForURL(/premium/i)

    await page.getByTestId('premium_users-button-pay_month').click()

    await page.getByLabel(/card number/i).fill('4242 4242 4242 4242')
    await page.getByLabel(/expiration/i).fill('05/32')
    await page.getByPlaceholder(/cvc/i).fill('123')
    await page.getByPlaceholder(/full name/i).fill('John Premium')
    await page.getByLabel(/country/i).selectOption('Sweden')
    await page.getByTestId('hosted-payment-submit-button').click()

    await page.waitForURL(/premium/i)
    await page.getByText(/you're a premium/i).waitFor()
  })

  test('loads premium video', async ({ page }) => {
    await page.goto(PAGE_URL + '/login')

    await page.getByLabel(/username/i).fill(EMAIL)
    await page.getByLabel(/password/i).fill(PASSWORD)
    await page.getByRole('button', { name: 'show'} ).click()
    await page.getByRole('button', { name: 'login' }).click()

    await page.getByRole('navigation').getByText('Local videos').click()

    await page.getByText(/premium video/i).click()

    await waitForVideoAndExpect(page)
  })
})

test.describe('add premium user via Stripe', () => {
  test.describe.configure({ mode: 'serial' });
  const stripe = new Stripe(process.env.STRIPE_API_KEY as string)
  const TEST_ID = Math.round(Date.now() / 1000)
  const EMAIL = `external${TEST_ID}@premi.um`
  const PASSWORD = 'testtest'

  test.beforeEach(async ({ page }) => {
    await disableModals(page)
  })

  test('setup user and add subscription in Stripe', async ({ page }) => {
    await page.goto(PAGE_URL + '/login')
    await page.getByLabel(/username/i).fill('root')
    await page.getByLabel(/password/i).fill(process.env.PT_INITIAL_ROOT_PASSWORD as string)
    await page.getByRole('button', { name: /login/i }).click()

    await page.getByRole('navigation').getByText(/admin/i).click()
    await page.getByText(/create user/i).click()

    await page.getByLabel(/username/i).fill('external_premium' + TEST_ID)
    await page.getByLabel(/channel/i).fill('external_premium_channel' + TEST_ID)
    await page.getByLabel(/email/i).fill(EMAIL)
    await page.getByLabel(/password/i).fill(PASSWORD)
    await page.getByText(/create user/i).click()

    const prices = await stripe.prices.list({ type: 'recurring' })
    const customer = await stripe.customers.create({ email: EMAIL })
    await stripe.subscriptions.create({
      customer: customer.id,
      billing_cycle_anchor: Math.round((Date.now() / 1000) + (3600 * 24 * 5)),
      proration_behavior: 'none',
      items: [
        {
          price: prices.data[0].id
        }
      ]
    })
  })

  test('user should be premium when added via Stripe', async ({ page }) => {
    await page.goto(PAGE_URL + '/login')
    await page.getByLabel(/username/i).fill(EMAIL)
    await page.getByLabel(/password/i).fill(PASSWORD)
    await page.getByRole('button', { name: /login/i }).click()

    await page.getByText(/my account/i).click()

    await page.getByText(/premium account/i).click()
    await waitUntilUserIsPremium(page)
    await page.reload()

    await page.getByText(/you're a premium/i).waitFor()
    await expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.02 })

    await page.getByText(/local videos/i).click()
    await page.getByText('Premium video').click()

    await waitForVideoAndExpect(page)

  })
})
