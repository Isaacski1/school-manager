import React from "react";

interface AvatarUser {
  name?: string;
  fullName?: string;
  photoUrl?: string;
}

interface UserAvatarProps {
  user?: AvatarUser | null;
  name?: string;
  photoUrl?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  name,
  photoUrl,
  size = "md",
  className = "",
}) => {
  const avatarName = name || user?.name || user?.fullName || "User";
  const avatarPhoto = photoUrl || user?.photoUrl;

  const sizeClasses = {
    xs: "w-6 h-6 text-[10px]",
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-xl",
    "2xl": "w-20 h-20 text-2xl",
  };

  const initials = avatarName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (avatarPhoto) {
    return (
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0 ${className}`}>
        <img
          src={avatarPhoto}
          alt={avatarName}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold border border-emerald-200 flex-shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
};

export default UserAvatar;
