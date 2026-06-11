import type { JusoRaw } from './juso'

export interface AddressResult {
  roadAddress: string
  jibunAddress: string
  englishAddress: string
  postalCode: string
  components: {
    city: string
    cityEnglish: string
    district: string
    neighbourhood: string
    roadName: string
    buildingNumber: string
    buildingName: string | null
  }
}

export const CITY_MAP: Record<string, string> = {
  '서울특별시': 'Seoul',
  '부산광역시': 'Busan',
  '인천광역시': 'Incheon',
  '대구광역시': 'Daegu',
  '대전광역시': 'Daejeon',
  '광주광역시': 'Gwangju',
  '울산광역시': 'Ulsan',
  '세종특별자치시': 'Sejong',
  '경기도': 'Gyeonggi-do',
  '강원특별자치도': 'Gangwon-do',
  '충청북도': 'Chungcheongbuk-do',
  '충청남도': 'Chungcheongnam-do',
  '전라도': 'Jeolla-do',
  '전라북도': 'Jeollabuk-do',
  '전라남도': 'Jeollanam-do',
  '경상북도': 'Gyeongsangbuk-do',
  '경상남도': 'Gyeongsangnam-do',
  '제주특별자치도': 'Jeju-do',
}

export function transformJusoResult(raw: JusoRaw): AddressResult {
  const buildingNumber = raw.buldSlno === '0'
    ? raw.buldMnnm
    : `${raw.buldMnnm}-${raw.buldSlno}`

  return {
    roadAddress: raw.roadAddr,
    jibunAddress: raw.jibunAddr,
    englishAddress: raw.engAddr,
    postalCode: raw.zipNo,
    components: {
      city: raw.siNm,
      cityEnglish: CITY_MAP[raw.siNm] ?? raw.siNm,
      district: raw.sggNm,
      neighbourhood: raw.emdNm,
      roadName: raw.rn,
      buildingNumber,
      buildingName: raw.bdNm || null,
    },
  }
}
