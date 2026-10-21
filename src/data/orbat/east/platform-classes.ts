/**
 * Every catalog platform id the eastern order of battle uses, by the coarse class the scale
 * checks count. It lets the orbat be validated before the full catalog exists, and it is
 * the list the catalog must cover.
 */
export type ScaleClass = 'tank' | 'combat_aircraft' | 'major_surface' | 'submarine' | 'icbm_launcher' | 'other';

const ids = (cls: ScaleClass, list: string): [string, ScaleClass][] => list.trim().split(/\s+/).map((id) => [id, cls]);

export const EAST_PLATFORM_CLASS: Record<string, ScaleClass> = Object.fromEntries([
  ...ids('tank', `
    t90m t80bvm t80bv t72b3 t72b t64bv t62m t55 t72s chieftain m60a1 m47m zulfiqar karrar
    type99a type96b type59d chonma_ho pokpung_ho chonma_20`),
  ...ids('combat_aircraft', `
    su35s su34 su30sm su27sm su57 mig31bm mig29smt mig29 su25sm su25 su24m su33 mig29kr tu160 tu95ms tu22m3
    j20a j16 j10c j10a j11b su30mkk j7 jh7a h6k h6n h6j j15 j15t
    mig23ml mig21 j6 j5 h5 f14a f4e f5e su24mk su22`),
  ...ids('major_surface', `
    kuznetsov kirov slava udaloy sovremenny admiral_gorshkov admiral_grigorovich neustrashimy krivak steregushchiy gepard
    cv_liaoning cv_shandong cv_fujian type055 type052d type052c type051c type054a
    najin choe_hyon moudge alvand`),
  ...ids('submarine', `
    borei borei_a delta_iv yasen yasen_m oscar_ii akula sierra kilo_636 kilo_877 lada
    type094 type093 type093b type039a type039 romeo sang_o yono gorae sinpo_c fateh_sub nahang ghadir`),
  ...ids('icbm_launcher', `
    yars_mobile yars_silo topol_m_mobile topol_m_silo avangard_silo r36m2_silo
    df41_tel df31ag_tel df5b_silo df41_silo icbm_silo_empty hwasong_15_tel hwasong_17_tel hwasong_18_tel hwasong_19_tel`),
  ...ids('other', `
    infantry_squad airborne_squad hj12_team truck gaz_tigr
    bmp1 bmp2 bmp3 bmd2 bmd4m btr82a btr_mdm mtlb m113 vtt323 zbd04a zbd03 zbl08 zbd05 ztd05 ztl11 csk181 zsd89 type15
    2s19_msta 2s3 2s7m 2s9 2a65 d30 m109 bm21_grad bm27 bm30 tos1a tos2 polonez_launcher koksan mrl_240mm kn09_tel kn25_tel
    plz05 plz07 pcl181 phl11 phl16
    iskander_m_tel iskander_mk_tel oreshnik_tel hwasong_5_tel kn23_tel kn24_tel nodong_tel hwasong_12_tel
    df26_tel df21_tel df21d_tel df17_tel df16_tel df15_tel df11_tel cj10_tel
    fateh_110_tel zolfaghar_tel khalij_fars_tel shahab_3_tel emad_tel kheibar_shekan_tel fattah_tel sejjil_tel khorramshahr_tel hoveyzeh_tel noor_asm_launcher
    bastion_p_launcher bal_launcher
    s400_launcher s300pm_launcher s300v4_launcher s300pmu2_launcher a135_silo pantsir_s1 tor_m2 tor_m1 buk_m3 buk_m2 strela10
    hq9_launcher hq16_launcher hq22_launcher hq17 pgz09 s200_launcher s75_launcher s125_launcher pongae5_launcher
    bavar373_launcher khordad15_launcher hawk_launcher
    shahed_136 shahed_129 mohajer_6 lancet orlan10
    a50u il78 il76 an124 il38n tu142m kj500 kj2000 kj600 y20 y9 y8q c130 yak130
    ka52 mi28 mi24p mi8amtsh z10 z19 z20 z8 z9 z18 mi171 ah1j
    grisha ropucha ivan_gren buyan_m karakurt molniya bykov
    type056a type022 type071 type075 type072a type072_iii type073a type074 roro_ferry type901 ccg_cutter ccg_patrol
    missile_boat fast_attack_craft bayandor shahid_soleimani`),
]);
