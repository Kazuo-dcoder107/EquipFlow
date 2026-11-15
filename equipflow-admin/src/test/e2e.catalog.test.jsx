// End-to-end check of the equipment and programs pages against the REAL running backend.
// Same setup as e2e.test.jsx:  seed_demo + uvicorn on port 8000, then  EQUIPFLOW_E2E=1 npm test
// Everything it creates has a unique name and is deleted again, so it can be run again and again.
import { describe, expect, it } from 'vitest'
import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './helpers'

configure({ asyncUtilTimeout: 4000 })

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`.toUpperCase()

async function signIn() {
  renderApp('/login', { loggedIn: false })
  await userEvent.type(screen.getByLabelText('Username'), 'admin')
  await userEvent.type(screen.getByLabelText('Password'), 'password123')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}
const goTo = (name) => userEvent.click(screen.getByRole('link', { name: new RegExp(name) }))
const dialog = () => within(screen.getByRole('dialog'))

describe.skipIf(!process.env.EQUIPFLOW_E2E)('equipment and programs against the real backend', () => {
  it('adds, renames and deletes a program', async () => {
    const name = `E2E Program ${unique()}`
    const renamed = `${name} Renamed`
    await signIn()
    await goTo('Programs')

    await userEvent.click(await screen.findByRole('button', { name: 'Add program to CET' }))
    await userEvent.type(dialog().getByLabelText('Program name'), name)
    await userEvent.click(dialog().getByRole('button', { name: 'Add program' }))
    expect(await screen.findByRole('status')).toHaveTextContent(`Added ${name} to CET.`)
    expect(await screen.findByRole('region', { name: 'CET' })).toHaveTextContent(name)

    await userEvent.click(await screen.findByRole('button', { name: `Rename ${name}` }))
    await userEvent.clear(dialog().getByLabelText('Program name'))
    await userEvent.type(dialog().getByLabelText('Program name'), renamed)
    await userEvent.click(dialog().getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(`Renamed to ${renamed}.`)).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: `Delete ${renamed}` }))
    await userEvent.click(dialog().getByRole('button', { name: 'Delete program' }))
    expect(await screen.findByText(`Deleted ${renamed}.`)).toBeInTheDocument()
  })

  it('adds a category and an item, then deletes both', async () => {
    const category = `E2E Category ${unique()}`
    const item = `E2E Item ${unique()}`
    await signIn()
    await goTo('Equipment')

    await userEvent.click(await screen.findByRole('tab', { name: 'Categories' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add category' }))
    await userEvent.type(dialog().getByLabelText('Name'), category)
    await userEvent.click(dialog().getByRole('button', { name: 'Add category' }))
    expect(await screen.findByText(`Added ${category}.`)).toBeInTheDocument()
    expect(await screen.findByText(category, { selector: 'strong' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Items' }))
    const add = await screen.findByRole('button', { name: 'Add item' })
    await userEvent.click(add)
    await userEvent.type(dialog().getByLabelText('Name'), item)
    await userEvent.type(dialog().getByLabelText('Tag UID'), `E2E${unique()}`)
    await userEvent.selectOptions(dialog().getByLabelText('Category'), `${category} (Equipment)`)
    await userEvent.click(dialog().getByRole('button', { name: 'Add item' }))
    expect(await screen.findByText(`Added ${item}.`)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Search'), item)
    await userEvent.click(within(await screen.findByText(item, { selector: 'strong' }).then((el) => el.closest('tr'))).getByRole('button', { name: 'Delete' }))
    await userEvent.click(dialog().getByRole('button', { name: 'Delete item' }))
    expect(await screen.findByText(`Deleted ${item}.`)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Categories' }))
    await userEvent.click(within(await screen.findByText(category, { selector: 'strong' }).then((el) => el.closest('tr'))).getByRole('button', { name: 'Delete' }))
    await userEvent.click(dialog().getByRole('button', { name: 'Delete category' }))
    expect(await screen.findByText(`Deleted ${category}.`)).toBeInTheDocument()
  })
})
