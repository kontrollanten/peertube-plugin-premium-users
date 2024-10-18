import { test, expect, Page } from '@playwright/test';

const PAGE_URL = 'http://localhost:9000'

const waitForVideoAndExpect = async (page: Page) => {
  await page.waitForSelector('video')

  await expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.03 })
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

  const TEST_ID = Math.round(Date.now() / 1000)
  const NAME = 'John Premium ' + TEST_ID
  const EMAIL = `john${TEST_ID}@premi.um`
  const PASSWORD = 'testtest'

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

    // Welcome modal
    await page.getByText(/Don't show/i).click()
    await page.getByText(/close/i).click()

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
