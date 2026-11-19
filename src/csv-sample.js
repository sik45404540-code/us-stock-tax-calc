/**
 * 샘플 파일 — 국내 증권사에서 내려받는 모양 그대로 만든 실현손익 CSV.
 *
 * 일부러 CP949(EUC-KR 계열)로 인코딩해 두었다. 인코딩 자동 판별이 실제로 동작하는지
 * 화면에서 바로 확인할 수 있도록 하기 위해서다. 브라우저가 Base64를 풀어 바이트로
 * 되돌리면 decodeBytes()가 utf-8 시도 → 실패 → euc-kr 재디코딩 순서로 읽는다.
 */

export const SAMPLE_CSV_BASE64 = [
  'wbbIuLHisKMsMjAyNi0wMS0wMSB+IDIwMjYtMTEtMTgssOjBwizH2L/cwda9xCDAp8W5DQrBvrjxuO0suMW1tcDPLLz2t64s',
  'uMW1tbHdvtcsuMW89rHdvtcsvPa89rfhLL3Hx/a81cDNDQq/o7rxtfC+xihOVkRBKSwyMDI2LTAzLTEyLDEwLCIyLDE1MCww',
  'MDAiLCIxLDQ4MCwwMDAiLDMwMDAsIjY3MCwwMDAiDQrF1729tvMoVFNMQSksMjAyNi0wNS0wOCw1LCIxLDMyMCwwMDAiLCIx',
  'LDY1MCwwMDAiLDI1MDAsIi0zMzAsMDAwIg0KvtbHwyhBQVBMKSwyMDI2LTA2LTIxLDIwLCI1LDQ4MCwwMDAiLCI0LDYxMCww',
  'MDAiLDQyMDAsIjg3MCwwMDAiDQq4tsDMxam3zrzSx8HGrihNU0ZUKSwyMDI2LTA4LTE0LDQsIjMsOTgwLDAwMCIsIjMsMTAw',
  'LDAwMCIsNTIwMCwiODgwLDAwMCINCriuvvPGvMDOxMQoTyksMjAyNi0wOS0wMiwzMCwiMiwwMTAsMDAwIiwiMiwxNjAsMDAw',
  'IiwzMTAwLCItMTUwLDAwMCINCr7GuLbBuChBTVpOKSwyMDI2LTEwLTE5LDgsIjQsNzYwLDAwMCIsIjMsNjQwLDAwMCIsMjIw',
  'MCwiMSwxMjAsMDAwIg0Kxsi29ca8vu4oUExUUiksMjAyNi0xMS0wNSwxNSwiMSwwNTAsMDAwIiwiMSwzMjAsMDAwIiwxODAw',
  'LCItMjcwLDAwMCINCrjexbgoTUVUQSksMjAyNi0xMS0xMiw2LCI0LDMyMCwwMDAiLCIzLDM2MCwwMDAiLDI0MDAsIjk2MCww',
  'MDAiDQrH1bDoLCwsLCwsIjMsNzUwLDAwMCINCg=='
].join('');

/** Base64 → Uint8Array (브라우저·Node 공용) */
export function base64ToBytes(base64) {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(base64, 'base64'));
  throw new Error('Base64 디코딩을 지원하지 않는 환경입니다.');
}

export function sampleCsvBytes() {
  return base64ToBytes(SAMPLE_CSV_BASE64);
}
