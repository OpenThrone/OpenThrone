import { getAssetPath } from '@/utils/utilities'
import Image from 'next/image'

export default function ThemedCard() {
  return (
    <div className="relative w-96 h-64 bg-gray-800 text-white p-4">
      {/* Corners (20x20) */}
      <Image
        src={getAssetPath('corner-double-border')}
        alt="top-left corner"
        className="absolute top-0 left-0"
        width={20}
        height={20}
      />
      <Image
        src={getAssetPath('corner-double-border')}
        alt="top-right corner"
        className="absolute top-0 right-0 transform rotate-90"
        width={20}
        height={20}
      />
      <Image
        src={getAssetPath('corner-double-border')}
        alt="bottom-left corner"
        className="absolute bottom-0 left-0 transform rotate-[270deg]"
        width={20}
        height={20}
      />
      <Image
        src={getAssetPath('corner-double-border')}
        alt="bottom-right corner"
        className="absolute bottom-0 right-0 transform rotate-180"
        width={20}
        height={20}
      />

      {/* Horizontal Edges */}
      <div className="absolute top-0 left-[20px] right-[20px] h-8 bg-[url('https://assets.openthrone.dev/images/background/ELF_top_double_border.svg')] bg-repeat-x"></div>
      <div className="absolute bottom-0 left-[20px] right-[20px] h-8 transform rotate-180">
        <div className="w-full h-full bg-[url('https://assets.openthrone.dev/images/background/ELF_top_double_border.svg')] bg-repeat-x"></div>
      </div>

      {/* Left Edge */}
      <div className="absolute top-[20px] left-0 w-8 h-full transform rotate-180">
        <div className="w-full h-full bg-[url('https://assets.openthrone.dev/images/background/ELF_top_double_border.svg')] bg-repeat-y rotate-90 origin-top-right"></div>
      </div>
      {/* Right Edge */}
      <div className="absolute top-[20px] right-0 w-8 h-full transform rotate-270">
        <div className="w-full h-full bg-[url('https://assets.openthrone.dev/images/background/ELF_top_double_border.svg')] bg-repeat-y rotate-270 origin-top-right"></div>
      </div>

      {/* Card Content */}
      <div className="relative z-10">
        <h1 className="text-xl font-bold mb-2">OT Themed Card Title</h1>
        <p>Some descriptive text here.</p>
      </div>
    </div>
  )
}
