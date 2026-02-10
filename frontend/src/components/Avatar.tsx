import React from 'react';

export const AVATAR_LIST = [
  { id: 'seal', name: '海豹' },
  { id: 'octopus', name: '章鱼' },
  { id: 'jellyfish', name: '水母' },
  { id: 'seahorse', name: '海马' },
  { id: 'pufferfish', name: '河豚' },
  { id: 'turtle', name: '海龟' },
  { id: 'whale', name: '鲸鱼' },
  { id: 'dolphin', name: '海豚' },
  { id: 'clownfish', name: '小丑鱼' },
  { id: 'starfish', name: '海星' },
] as const;

export type AvatarId = typeof AVATAR_LIST[number]['id'];

interface AvatarProps {
  avatarId: string;
  size?: number;
  className?: string;
}

const SealAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#B8C9D9"/>
    <ellipse cx="50" cy="55" rx="35" ry="30" fill="#D4E3EF"/>
    <circle cx="38" cy="42" r="5" fill="#2D3436"/>
    <circle cx="62" cy="42" r="5" fill="#2D3436"/>
    <circle cx="39" cy="41" r="2" fill="white"/>
    <circle cx="63" cy="41" r="2" fill="white"/>
    <ellipse cx="50" cy="52" rx="6" ry="4" fill="#2D3436"/>
    <path d="M44 58 Q50 64 56 58" stroke="#2D3436" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <circle cx="30" cy="55" r="6" fill="#F8B4B4" opacity="0.5"/>
    <circle cx="70" cy="55" r="6" fill="#F8B4B4" opacity="0.5"/>
    <path d="M22 35 Q18 25 28 30" stroke="#B8C9D9" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <path d="M78 35 Q82 25 72 30" stroke="#B8C9D9" strokeWidth="3" fill="none" strokeLinecap="round"/>
  </svg>
);

const OctopusAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#E8A0BF"/>
    <ellipse cx="50" cy="42" rx="28" ry="24" fill="#F0C4D8"/>
    <circle cx="40" cy="38" r="5" fill="#2D3436"/>
    <circle cx="60" cy="38" r="5" fill="#2D3436"/>
    <circle cx="41" cy="37" r="2" fill="white"/>
    <circle cx="61" cy="37" r="2" fill="white"/>
    <path d="M45 48 Q50 53 55 48" stroke="#2D3436" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M25 62 Q20 80 30 75" stroke="#E8A0BF" strokeWidth="4" fill="none" strokeLinecap="round"/>
    <path d="M35 65 Q30 85 40 78" stroke="#E8A0BF" strokeWidth="4" fill="none" strokeLinecap="round"/>
    <path d="M50 67 Q50 88 55 78" stroke="#E8A0BF" strokeWidth="4" fill="none" strokeLinecap="round"/>
    <path d="M65 65 Q70 85 60 78" stroke="#E8A0BF" strokeWidth="4" fill="none" strokeLinecap="round"/>
    <path d="M75 62 Q80 80 70 75" stroke="#E8A0BF" strokeWidth="4" fill="none" strokeLinecap="round"/>
  </svg>
);

const JellyfishAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#C8A2C8"/>
    <ellipse cx="50" cy="38" rx="25" ry="20" fill="#E6D5E6" opacity="0.9"/>
    <circle cx="42" cy="35" r="4" fill="#2D3436"/>
    <circle cx="58" cy="35" r="4" fill="#2D3436"/>
    <circle cx="43" cy="34" r="1.5" fill="white"/>
    <circle cx="59" cy="34" r="1.5" fill="white"/>
    <path d="M46 43 Q50 47 54 43" stroke="#2D3436" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M32 55 Q28 75 35 70" stroke="#C8A2C8" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7"/>
    <path d="M42 58 Q38 80 45 73" stroke="#C8A2C8" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7"/>
    <path d="M50 58 Q50 82 53 73" stroke="#C8A2C8" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7"/>
    <path d="M58 58 Q62 80 55 73" stroke="#C8A2C8" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7"/>
    <path d="M68 55 Q72 75 65 70" stroke="#C8A2C8" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7"/>
  </svg>
);

const SeahorseAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#FFD93D"/>
    <ellipse cx="50" cy="35" rx="18" ry="20" fill="#FFE88D"/>
    <circle cx="45" cy="32" r="4" fill="#2D3436"/>
    <circle cx="46" cy="31" r="1.5" fill="white"/>
    <path d="M52 38 Q55 36 57 33" stroke="#FFD93D" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <path d="M48 42 Q50 46 52 42" stroke="#2D3436" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M50 55 Q55 65 50 75 Q45 85 40 78" stroke="#FFD93D" strokeWidth="6" fill="none" strokeLinecap="round"/>
    <path d="M40 78 Q35 72 38 68" stroke="#FFD93D" strokeWidth="4" fill="none" strokeLinecap="round"/>
    <path d="M42 20 Q45 12 50 18" stroke="#FFD93D" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <circle cx="62" cy="32" r="3" fill="#F8B4B4" opacity="0.5"/>
  </svg>
);

const PufferfishAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#A8D8EA"/>
    <circle cx="50" cy="50" r="30" fill="#D4EEF7"/>
    <circle cx="40" cy="44" r="5" fill="#2D3436"/>
    <circle cx="60" cy="44" r="5" fill="#2D3436"/>
    <circle cx="41" cy="43" r="2" fill="white"/>
    <circle cx="61" cy="43" r="2" fill="white"/>
    <ellipse cx="50" cy="56" rx="5" ry="3" fill="#F8B4B4"/>
    <circle cx="30" cy="35" r="2" fill="#A8D8EA"/>
    <circle cx="70" cy="35" r="2" fill="#A8D8EA"/>
    <circle cx="25" cy="50" r="2" fill="#A8D8EA"/>
    <circle cx="75" cy="50" r="2" fill="#A8D8EA"/>
    <circle cx="30" cy="65" r="2" fill="#A8D8EA"/>
    <circle cx="70" cy="65" r="2" fill="#A8D8EA"/>
    <circle cx="50" cy="22" r="2" fill="#A8D8EA"/>
    <circle cx="50" cy="78" r="2" fill="#A8D8EA"/>
    <circle cx="32" cy="55" r="5" fill="#F8B4B4" opacity="0.4"/>
    <circle cx="68" cy="55" r="5" fill="#F8B4B4" opacity="0.4"/>
  </svg>
);

const TurtleAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#7BC67E"/>
    <ellipse cx="50" cy="55" rx="30" ry="22" fill="#A8D8A8"/>
    <ellipse cx="50" cy="55" rx="22" ry="16" fill="#7BC67E"/>
    <line x1="35" y1="45" x2="50" y2="55" stroke="#5FA85F" strokeWidth="1.5"/>
    <line x1="65" y1="45" x2="50" y2="55" stroke="#5FA85F" strokeWidth="1.5"/>
    <line x1="35" y1="65" x2="50" y2="55" stroke="#5FA85F" strokeWidth="1.5"/>
    <line x1="65" y1="65" x2="50" y2="55" stroke="#5FA85F" strokeWidth="1.5"/>
    <ellipse cx="50" cy="32" rx="12" ry="10" fill="#A8D8A8"/>
    <circle cx="45" cy="30" r="3" fill="#2D3436"/>
    <circle cx="55" cy="30" r="3" fill="#2D3436"/>
    <circle cx="46" cy="29" r="1" fill="white"/>
    <circle cx="56" cy="29" r="1" fill="white"/>
    <path d="M47 36 Q50 39 53 36" stroke="#2D3436" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <circle cx="40" cy="35" r="3" fill="#F8B4B4" opacity="0.4"/>
    <circle cx="60" cy="35" r="3" fill="#F8B4B4" opacity="0.4"/>
  </svg>
);

const WhaleAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#5B8FB9"/>
    <ellipse cx="50" cy="52" rx="35" ry="25" fill="#7EB5D6"/>
    <circle cx="35" cy="45" r="4" fill="#2D3436"/>
    <circle cx="36" cy="44" r="1.5" fill="white"/>
    <path d="M30 58 Q35 62 40 58" stroke="#2D3436" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <ellipse cx="55" cy="55" rx="12" ry="8" fill="#B8D8EA"/>
    <path d="M50 28 Q48 18 45 22 M50 28 Q52 18 55 22" stroke="#7EB5D6" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <ellipse cx="80" cy="45" rx="5" ry="10" fill="#7EB5D6"/>
    <circle cx="25" cy="52" r="5" fill="#F8B4B4" opacity="0.3"/>
  </svg>
);

const DolphinAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#74B9FF"/>
    <ellipse cx="50" cy="50" rx="32" ry="22" fill="#A0D2FF"/>
    <path d="M78 45 Q85 40 82 50" stroke="#74B9FF" strokeWidth="4" fill="none" strokeLinecap="round"/>
    <ellipse cx="30" cy="48" rx="8" ry="12" fill="#A0D2FF"/>
    <circle cx="35" cy="44" r="4" fill="#2D3436"/>
    <circle cx="36" cy="43" r="1.5" fill="white"/>
    <path d="M22 50 Q25 55 28 50" stroke="#2D3436" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M50 30 Q52 22 55 28" stroke="#74B9FF" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <ellipse cx="50" cy="56" rx="18" ry="8" fill="#D4ECFF"/>
    <circle cx="28" cy="50" r="4" fill="#F8B4B4" opacity="0.3"/>
  </svg>
);

const ClownfishAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#FF9234"/>
    <ellipse cx="50" cy="50" rx="30" ry="22" fill="#FFB573"/>
    <rect x="35" y="30" width="4" height="40" rx="2" fill="white" opacity="0.8"/>
    <rect x="50" y="32" width="4" height="36" rx="2" fill="white" opacity="0.8"/>
    <rect x="63" y="34" width="4" height="32" rx="2" fill="white" opacity="0.8"/>
    <circle cx="40" cy="44" r="5" fill="#2D3436"/>
    <circle cx="58" cy="44" r="5" fill="#2D3436"/>
    <circle cx="41" cy="43" r="2" fill="white"/>
    <circle cx="59" cy="43" r="2" fill="white"/>
    <path d="M45 56 Q50 61 55 56" stroke="#2D3436" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M22 45 Q15 42 18 50" stroke="#FF9234" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <path d="M78 45 Q85 42 82 50" stroke="#FF9234" strokeWidth="3" fill="none" strokeLinecap="round"/>
  </svg>
);

const StarfishAvatar = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#FFB7B2"/>
    <path d="M50 18 L56 38 L78 38 L60 50 L66 72 L50 58 L34 72 L40 50 L22 38 L44 38 Z" fill="#FFD5D0"/>
    <circle cx="45" cy="44" r="3" fill="#2D3436"/>
    <circle cx="55" cy="44" r="3" fill="#2D3436"/>
    <circle cx="46" cy="43" r="1" fill="white"/>
    <circle cx="56" cy="43" r="1" fill="white"/>
    <path d="M47 51 Q50 54 53 51" stroke="#2D3436" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <circle cx="42" cy="48" r="3" fill="#F8B4B4" opacity="0.5"/>
    <circle cx="58" cy="48" r="3" fill="#F8B4B4" opacity="0.5"/>
  </svg>
);

const avatarComponents: Record<string, React.FC<{ size: number }>> = {
  seal: SealAvatar,
  octopus: OctopusAvatar,
  jellyfish: JellyfishAvatar,
  seahorse: SeahorseAvatar,
  pufferfish: PufferfishAvatar,
  turtle: TurtleAvatar,
  whale: WhaleAvatar,
  dolphin: DolphinAvatar,
  clownfish: ClownfishAvatar,
  starfish: StarfishAvatar,
};

const Avatar: React.FC<AvatarProps> = ({ avatarId, size = 48, className }) => {
  const Component = avatarComponents[avatarId] || avatarComponents.seal;
  return (
    <div className={className} style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <Component size={size} />
    </div>
  );
};

export default Avatar;
