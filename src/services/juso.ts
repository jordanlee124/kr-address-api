export interface JusoRaw {
  roadAddr: string
  roadAddrPart1: string
  jibunAddr: string
  engAddr: string
  zipNo: string
  admCd: string
  siNm: string
  sggNm: string
  emdNm: string
  liNm: string
  rn: string
  bdNm: string
  buldMnnm: string
  buldSlno: string
}

export async function searchJuso(
  keyword: string,
  confmKey: string,
  count = 5
): Promise<JusoRaw[]> {
  const params = new URLSearchParams({
    currentPage: '1',
    countPerPage: String(count),
    keyword,
    resultType: 'json',
  })

  // confmKey is base64 and contains '=' which URLSearchParams encodes to '%3D'.
  // The Juso API does not decode it, so we prepend the key raw.
  const url = `https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=${confmKey.trim()}&${params}`

  const res = await fetch(url)
  if (!res.ok) return []

  const json = await res.json() as { results?: { common?: { errorCode?: string }; juso?: JusoRaw[] } }
  if (json?.results?.common?.errorCode !== '0') return []
  return (json?.results?.juso ?? []) as JusoRaw[]
}
