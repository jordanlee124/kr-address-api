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
    confmKey,
    currentPage: '1',
    countPerPage: String(count),
    keyword,
    resultType: 'json',
  })

  const res = await fetch(
    `https://business.juso.go.kr/addrlink/addrLinkApi.do?${params}`
  )
  if (!res.ok) return []

  const json = await res.json() as { results?: { common?: { errorCode?: string }; juso?: JusoRaw[] } }
  if (json?.results?.common?.errorCode !== '0') return []
  return (json?.results?.juso ?? []) as JusoRaw[]
}
