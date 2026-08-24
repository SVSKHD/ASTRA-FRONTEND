// Section 27a — the device label, against real user-agent strings.
//
// Every case here is a UA that lies about itself in some way, because they all
// do. The tests are the documentation of which lie is being unpicked.
import { describe, expect, it } from 'vitest'
import {
  browserName,
  describeDevice,
  deviceIcon,
  deviceType,
  locationLabel,
  osName,
} from '@/utils/device'

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  edgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  safariIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeAndroidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  chromeAndroidTablet:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  crios:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1',
}

describe('the browser, past the impersonations', () => {
  it('does not call Edge "Chrome", though Edge says Chrome', () => {
    expect(UA.edgeWin).toContain('Chrome/')
    expect(browserName(UA.edgeWin)).toBe('Edge')
  })

  it('does not call Opera "Chrome", though Opera says Chrome', () => {
    expect(browserName(UA.opera)).toBe('Opera')
  })

  it('does not call Samsung Internet "Chrome"', () => {
    expect(browserName(UA.samsung)).toBe('Samsung Internet')
  })

  it('does not call Chrome "Safari", though every Chrome says Safari', () => {
    expect(UA.chromeMac).toContain('Safari/')
    expect(browserName(UA.chromeMac)).toBe('Chrome')
  })

  it('recognises Chrome on iOS, which is called CriOS and is really WebKit', () => {
    expect(browserName(UA.crios)).toBe('Chrome')
  })

  it('still finds real Safari', () => {
    expect(browserName(UA.safariMac)).toBe('Safari')
    expect(browserName(UA.firefoxLinux)).toBe('Firefox')
  })

  it('admits when it does not know', () => {
    expect(browserName('curl/8.4.0')).toBe('Unknown')
  })
})

describe('the device type', () => {
  it('reads an Android tablet as a tablet — it is the one WITHOUT "Mobile"', () => {
    // The trap: "Mobile" present means phone, absent means tablet. Read quickly,
    // that is backwards, and getting it backwards puts a tablet icon on a Pixel.
    expect(UA.chromeAndroidTablet).not.toContain('Mobile')
    expect(deviceType(UA.chromeAndroidTablet)).toBe('tablet')
    expect(UA.chromeAndroidPhone).toContain('Mobile')
    expect(deviceType(UA.chromeAndroidPhone)).toBe('mobile')
  })

  it('reads an iPad as a tablet, though its UA says "Mobile"', () => {
    expect(UA.safariIpad).toContain('Mobile')
    expect(deviceType(UA.safariIpad)).toBe('tablet')
  })

  it('reads a phone as a phone and a laptop as a desktop', () => {
    expect(deviceType(UA.safariIphone)).toBe('mobile')
    expect(deviceType(UA.chromeMac)).toBe('desktop')
    expect(deviceType(UA.edgeWin)).toBe('desktop')
  })

  it('has an icon for each, from the one sprite', () => {
    expect(deviceIcon('mobile')).toBe('smartphone')
    expect(deviceIcon('tablet')).toBe('tablet')
    expect(deviceIcon('desktop')).toBe('monitor')
  })
})

describe('the OS', () => {
  it('separates iOS from macOS even though iOS says "like Mac OS X"', () => {
    expect(UA.safariIphone).toContain('Mac OS X')
    expect(osName(UA.safariIphone)).toBe('iOS')
    expect(osName(UA.chromeMac)).toBe('macOS')
  })

  it('separates Android from Linux even though Android says "Linux"', () => {
    expect(UA.chromeAndroidPhone).toContain('Linux')
    expect(osName(UA.chromeAndroidPhone)).toBe('Android')
    expect(osName(UA.firefoxLinux)).toBe('Linux')
  })

  it('names Windows and admits the rest', () => {
    expect(osName(UA.edgeWin)).toBe('Windows')
    expect(osName('')).toBe('Unknown')
  })
})

describe('the label', () => {
  it('reads as a sentence', () => {
    expect(describeDevice(UA.chromeMac).deviceLabel).toBe('Chrome on macOS')
    expect(describeDevice(UA.safariIphone).deviceLabel).toBe('Safari on iOS')
  })

  it('does not say "Unknown on Unknown"', () => {
    // A label that admits it knows nothing beats one that pretends symmetry.
    expect(describeDevice('').deviceLabel).toBe('Unknown device')
    expect(describeDevice('curl/8.4.0 (Windows NT 10.0)').deviceLabel).toBe('Windows')
  })
})

describe('the location line', () => {
  it('joins what it has and never leaves a dangling comma', () => {
    expect(locationLabel('Hyderabad', 'India')).toBe('Hyderabad, India')
    expect(locationLabel(null, 'India')).toBe('India')
    expect(locationLabel('Hyderabad', null)).toBe('Hyderabad')
    expect(locationLabel('', '  ')).toBe('Unknown location')
    expect(locationLabel(null, null)).toBe('Unknown location')
  })
})
