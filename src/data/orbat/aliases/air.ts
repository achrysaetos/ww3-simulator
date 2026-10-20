/**
 * ORBAT id -> catalog id where both name the same system (air slice): the same
 * airframe under another designation, or a variant whose radar, weapons and
 * performance put it within ~10% of the catalog row.
 */
export const aliases: Record<string, string> = {
  // fighters and multirole
  j7: 'mig21', f7: 'mig21', f7pg: 'mig21',
  su27sm: 'su27',
  // Su-33 is the carrier Flanker: Su-27-generation radar and R-27/R-73 armament.
  su33: 'su27',
  su30sm: 'su30sm2',
  su30mkk: 'su30mk', su30mk2: 'su30mk', su30k: 'su30mk',
  // Su-30MKA is the Algerian MKI derivative (canards, TVC, Bars radar).
  su30mka: 'su30mki',
  // MiG-29M/M2, SMT and KR share the Zhuk-ME radar and R-77 generation of the MiG-29K.
  mig29kr: 'mig29k', mig29smt: 'mig29k', mig29m: 'mig29k',
  mig23: 'mig23ml',
  j15t: 'j15', j10ce: 'j10c',
  f14a: 'f14a_irn',
  f35i: 'f35a', fa18f: 'f18e', fa50ph: 'fa50',
  kf16: 'f16c', f16a: 'f16am', f16e: 'f16v',
  f15k: 'f15e', f15sg: 'f15e', f15sa: 'f15ex', f15qa: 'f15ex',
  mitsubishi_f2: 'f2',
  // India's Mirage 2000H fleet is upgraded to 2000I (-5 standard); the UAE -9 is in the base row.
  mirage2000: 'mirage2000_5', mirage2000_9: 'mirage2000_5',
  mirage5: 'mirage3',
  // attack, trainers
  a29: 'emb314', at6th: 'emb314',
  su25sm: 'su25sm3',
  su24: 'su24m', su24mk: 'su24m',
  hawk_mk120: 'hawk200',
  t50i: 't50iq', t50th: 't50iq',
  af1_skyhawk: 'a4ar',
  // bombers, support
  tu160: 'tu160m',
  il76: 'il76md', c17: 'c17a', c2: 'c2_kawasaki', cn295: 'c295',
  c130: 'c130h', c130bz: 'c130h',
  il78: 'il78m', a330_mrtt: 'a330mrtt', kc30a: 'a330mrtt', kc330: 'a330mrtt',
  e3a: 'e3g', e7t: 'e7a',
  e99: 'erieye', saab2000_erieye: 'erieye', saab340_aew: 'erieye',
  netra_aewc: 'netra',
  y8q: 'kq200', p8i: 'p8a',
  // drones
  bayraktar_tb2: 'tb2', akinci_ucav: 'akinci', anka_s: 'anka',
  mq9b: 'mq9', shahed_129: 'shahed129', mohajer_6: 'mohajer6',
  // helicopters
  ka52: 'ka52m',
  mi28: 'mi28nm', mi28n: 'mi28nm', mi28ne: 'mi28nm',
  mi24: 'mi24v', mi24p: 'mi24v', mi35: 'mi35m',
  ah1f: 'ah1s', ah1j: 'ah1s',
  z10me: 'z10', t129_atak: 't129', tiger_arh: 'tiger',
  mi17: 'mi8', mi171: 'mi8', mi8amtsh: 'mi8',
  uh60: 'uh60m', uh60ja: 'uh60m', s70a: 'uh60m', s70i_blackhawk: 'uh60m',
  uh1j: 'uh1h', bell412: 'uh1h',
  as365: 'z9', hm1_pantera: 'z9', hm4_jaguar: 'h225m',
  z18: 'z8', nh90: 'nh90_tth', v22: 'mv22b',
  ch47j: 'ch47f', ch47d: 'ch47f', ch47sd: 'ch47f',
  // Western order of battle (src/data/orbat/west).
  fa18ef: 'f18e', fa18cd: 'f18c', cf18: 'f18c',
  // EF-18M: Spanish Hornet MLU to C/D standard (AMRAAM, IRIS-T).
  ef18m: 'f18c',
  f16_blk70: 'f16v',
  rafale_c: 'rafale', rafale_b: 'rafale', rafale_m: 'rafale',
  tornado_ecr: 'tornado_ids',
  mq9a: 'mq9', rq4: 'rq4b', rc135: 'rc135v', e3f: 'e3g',
  // EC-130H carries the Compass Call mission system the EC-37B rehosts.
  ec130h: 'ec37b',
  // CP-140 Aurora is a P-3 airframe with S-3 Viking mission avionics.
  cp140: 'p3c',
  merlin: 'aw101',
  cv22b: 'mv22b', cmv22b: 'mv22b',
  hh60m: 'uh60m', hh60w: 'uh60m',
  // MH-60S and UH-1Y are utility lifters within ~10% of the UH-60M's troop and cargo capacity.
  mh60s: 'uh60m', uh1y: 'uh60m',
  // munitions
  agm86b_alcm: 'agm86b', asmp_a: 'asmpa',
};
