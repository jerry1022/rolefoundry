import { BlockList, isIP } from "node:net";
export interface PublicAddress {
  address: string;
  family: 4 | 6;
}
const blocked4 = new BlockList(),
  blocked6 = new BlockList(),
  global6 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked4.addSubnet(address, prefix, "ipv4");
global6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked6.addSubnet(address, prefix, "ipv6");
export function isPublicAddress(value: PublicAddress) {
  if (value.address.includes("%") || isIP(value.address) !== value.family) return false;
  return value.family === 4
    ? !blocked4.check(value.address, "ipv4")
    : global6.check(value.address, "ipv6") && !blocked6.check(value.address, "ipv6");
}
