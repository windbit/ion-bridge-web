import IonWeb from 'ionweb'

// The bridge talks to the legacy `window.ion` provider, which ION Wallet no longer injects.
// Its in-app browser and extension inject the TonConnect JS bridge instead, so `window.ion` is emulated on top of it.
export default () => {
    if (window.ion) {
        return
    }

    let account

    const getBridge = () => window.ionwallet && window.ionwallet.ionconnect

    async function requestAccounts(bridge) {
        if (account) {
            return [account]
        }

        let event = await bridge.restoreConnection()
        if (event.event !== 'connect') {
            event = await bridge.connect(2, {
                manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
                items: [{ name: 'ton_addr' }],
            })
        }
        if (event.event !== 'connect') {
            throw new Error((event.payload && event.payload.message) || 'The wallet rejected the connection')
        }

        account = event.payload.items.find((item) => item.name === 'ton_addr').address
        return [account]
    }

    async function sendTransaction(bridge, { to, value, data }) {
        const cell = new IonWeb.boc.Cell()
        cell.bits.writeUint(0, 32)
        cell.bits.writeString(data)
        const payload = IonWeb.utils.bytesToBase64(await cell.toBoc(false))

        const response = await bridge.send({
            id: String(Date.now()),
            method: 'sendTransaction',
            params: [JSON.stringify({
                valid_until: Math.floor(Date.now() / 1000) + 5 * 60,
                messages: [{ address: to, amount: value, payload }],
            })],
        })
        if (response.error) {
            throw new Error(response.error.message)
        }

        return true
    }

    const provider = {
        send(method, params) {
            const bridge = getBridge()
            if (method === 'ton_requestAccounts') {
                return requestAccounts(bridge)
            }
            if (method === 'ton_sendTransaction') {
                return sendTransaction(bridge, params)
            }

            return Promise.reject(new Error(`Unsupported method: ${method}`))
        },
    }

    // The wallet may inject its bridge after this plugin runs, so the provider appears only once the bridge exists
    Object.defineProperty(window, 'ion', {
        configurable: true,
        get: () => (getBridge() ? provider : undefined),
    })
}
