var version = "1.0";

var console_info = ["%c Advanced %cSteam Blocker" + version + " by DoomFish %c", "background: #000000;color: #7EBE45", "background: #000000;color: #ffffff", ""];
console.log.apply(console, console_info);

var storage = chrome.storage.sync || chrome.storage.local;
var info = 0;
var protocol = (window.location.protocol);

var total_requests = 0;
var processed_requests = 0;

var cookie = document.cookie;
var language;
$("script[src]").each(function() {
	var match = this.src.match(/(?:\?|&(?:amp;)?)l=([^&]+)/);
	if (match) {
		language = match[1];
		return false;
	}
});
if (language === undefined) {
	language = (cookie.match(/steam_language=([a-z]+)/i) || [])[1] || "english";
}

// Set language for options page
storage.set({'language': language});

var localized_strings = [];
var localization_promise = (function () {
	var l_deferred = new $.Deferred();
	var l_code = {"bulgarian": "bg",
		"czech": "cs",
		"danish": "da",
		"dutch": "nl",
		"finnish": "fi",
		"french": "fr",
		"greek": "el",
		"german": "de",
		"hungarian": "hu",
		"italian": "it",
		"japanese": "ja",
		"koreana": "ko",
		"norwegian": "no",
		"polish": "pl",
		"portuguese": "pt-PT",
		"brazilian": "pt-BR",
		"russian": "ru",
		"romanian": "ro",
		"schinese": "zh-CN",
		"spanish": "es-ES",
		"swedish": "sv-SE",
		"tchinese": "zh-TW",
		"thai": "th",
		"turkish": "tr",
		"ukrainian": "ua"}[language] || "en";
	$.ajax({
		url: chrome.extension.getURL('/localization/en/strings.json'),
		mimeType: "application/json",
		success: function (data) {
			if (l_code == "en") {
				localized_strings = data;
				l_deferred.resolve();
			} else {
				$.ajax({
					url: chrome.extension.getURL('/localization/' + l_code + '/strings.json'),
					mimeType: "application/json",
					success: function (data_localized) {
						localized_strings = $.extend(true, data, data_localized);
						l_deferred.resolve();
					}
				});
			}
		}
	});
	return l_deferred.promise();
})();

var user_currency;
var currency_promise = (function() {
	var deferred = new $.Deferred();
	storage.get(function(settings) {
		if (settings.override_price === undefined) { settings.override_price = "auto"; storage.set({'override_price': settings.override_price}); }
		if (settings.override_price != "auto") {
			user_currency = settings.override_price;
			deferred.resolve();
		} else {
			chrome.storage.local.get("user_currency", function(currency_cache) {
				var expire_time = parseInt(Date.now() / 1000, 10) - 1 * 60 * 60; // One hour ago
				if (currency_cache.user_currency && currency_cache.user_currency.currency_type && currency_cache.user_currency.updated >= expire_time) {
					user_currency = currency_cache.user_currency.currency_type;
					deferred.resolve();
				} else {
					get_http(protocol + "//store.steampowered.com/steamaccount/addfunds", function(txt) {
						user_currency = $(txt).find("input[name=currency]").first().val();
					}, "xhrFields: { withCredentials: true }").fail(function() {
						get_http(protocol + "//store.steampowered.com/app/220", function(txt) {
							var currency = parse_currency($(txt).find(".price, .discount_final_price").text().trim());
							if (!currency) return;
							user_currency = currency.currency_type;
						}, "xhrFields: { withCredentials: true }").fail(function() {
							user_currency = "USD";
						}).done(function() {
							chrome.storage.local.set({user_currency: {currency_type: user_currency, updated: parseInt(Date.now() / 1000, 10)}});
						}).always(function() {
							deferred.resolve();
						});
					}).done(function() {
						chrome.storage.local.set({user_currency: {currency_type: user_currency, updated: parseInt(Date.now() / 1000, 10)}});
						deferred.resolve();
					});
				}
			});
		}
	});
	return deferred.promise();
})();

// Check if the user is signed in
var is_signed_in = false;
var profile_url = false;
var profile_path = false;

var signed_in_promise = (function () {
	var deferred = new $.Deferred();

	profile_url = $("#global_actions").find(".playerAvatar").prop("href");
	profile_path = profile_url && (profile_url.match(/\/(?:id|profiles)\/(.+?)\/$/) || [])[0];

	if (profile_path) {
		var user_login = getValue("user_login");

		if (user_login && user_login.profile_path == profile_path) {
			is_signed_in = user_login.steamID;
			
			deferred.resolve();
		} else {
			get_http("//steamcommunity.com/profiles/0/", function(txt) {
				is_signed_in = (txt.match(/g_steamID = "(\d+)";/) || [])[1];

				if (is_signed_in) {
					setValue("user_login", {"steamID": is_signed_in, "profile_path": profile_path});
				}

				deferred.resolve();
			}, { xhrFields: {withCredentials: true} });
		}
	} else {
		deferred.resolve();
	}

	return deferred.promise();
})();


$(document).ready(function(){
	var path = window.location.pathname.replace(/\/+/g, "/");

	$.when(localization_promise, signed_in_promise, currency_promise).done(function(){
			// On window load
			version_check();
			add_enhanced_steam_options();
			add_fake_country_code_warning();
			add_language_warning();
			remove_install_steam_button();
			remove_about_menu();
			add_header_links();
			process_early_access();
			disable_link_filter();
			if (is_signed_in) {
				add_redeem_link();
				replace_account_name();
				launch_random_button();
				add_itad_button();
			}

			// Attach event to the logout button
			$('a[href$="javascript:Logout();"]').bind('click', clear_cache);

			switch (window.location.host) {
				case "store.steampowered.com":

					if (is_signed_in) {
						add_birthday_celebration(true);
					}

					switch (true) {
						case /\bagecheck\b/.test(path):
							send_age_verification();
							break;

						case /^\/app\/.*/.test(path):
							var appid = get_appid(window.location.host + path);
							var metalink = $("#game_area_metalink").find("a").attr("href");

							media_slider_expander(true);
							init_hd_player();

							storePageData.load(appid, metalink);

							add_app_page_wishlist_changes(appid);
							display_coupon_message(appid);
							show_pricing_history(appid, "app");
							dlc_data_from_site(appid);

							drm_warnings("app");
							add_metacritic_userscore();
							add_opencritic_data(appid);
							display_purchase_date();

							add_widescreen_certification(appid);
							add_hltb_info(appid);
							add_steam_client_link(appid);
							add_pcgamingwiki_link(appid);
							add_steamcardexchange_link(appid);
							add_app_page_highlights();
							add_steamdb_links(appid, "app");
							add_familysharing_warning(appid);
							add_dlc_page_link(appid);
							add_pack_breakdown();
							add_package_info_button();
							add_steamchart_info(appid);
							add_steamspy_info(appid);
							survey_data_from_site(appid);
							add_system_requirements_check(appid);
							add_app_badge_progress(appid);
							add_dlc_checkboxes();
							add_astats_link(appid);
							add_achievement_completion_bar(appid);

							show_regional_pricing("app");
							add_review_toggle_button();

							customize_app_page(appid);
							add_help_button(appid);
							skip_got_steam();

							if (language == "schinese" || language == "tchinese") {
								storePageDataCN.load(appid);
								add_keylol_link();
								add_steamcn_mods();
								if (language == "schinese") add_chinese_name();
							}

							break;

						case /^\/sub\/.*/.test(path):
							var subid = get_subid(window.location.host + path);
							drm_warnings("sub");
							subscription_savings_check();
							show_pricing_history(subid, "sub");
							add_steamdb_links(subid, "sub");

							show_regional_pricing("sub");
							skip_got_steam();
							break;

						case /^\/bundle\/.*/.test(path):
							var bundleid = get_subid(window.location.host + path);
							drm_warnings("sub");
							show_pricing_history(bundleid, "bundle");
							add_steamdb_links(bundleid, "bundle");
							break;

						case /^\/dlc\/.*/.test(path):
							dlc_data_for_dlc_page();
							break;

						case /^\/video\/.*/.test(path):
							skip_got_steam();
						break;

						case /^\/account\/registerkey(\/.*)?/.test(path):
							keep_ssa_checked();
							activate_multiple_keys();
							return;
							break;
						
						case /^\/account(\/.*)?/.test(path):
							account_total_spent();
							replace_account_name();
							return;
							break;

						case /^\/(steamaccount\/addfunds|digitalgiftcards\/selectgiftcard)/.test(path):
							add_custom_money_amount();
							break;

						case /^\/search\/.*/.test(path):
							endless_scrolling();
							add_hide_buttons_to_search();
							add_exclude_tags_to_search();
							break;

						case /^\/sale\/.*/.test(path):
							show_regional_pricing("sale");
							break;

						// Storefront-front only
						case /^\/$/.test(path):
							add_popular_tab();
							add_allreleases_tab();
							set_homepage_tab();
							highlight_recommendations();
							customize_home_page();
							break;
					}

					// Alternative Linux icon
					alternative_linux_icon();

					// Highlights & data fetching
					start_highlights_and_tags();

					// Storefront homepage tabs
					bind_ajax_content_highlighting();
					hide_trademark_symbols();
					set_html5_video();
					//get_store_session();
					fix_menu_dropdown();
					break;

				case "steamcommunity.com":

					if (is_signed_in) {
						add_birthday_celebration();
					}

					switch (true) {
						case /^\/(?:id|profiles)\/.+\/wishlist/.test(path):
							change_wishlist_format();
							alternative_linux_icon();
							appdata_on_wishlist();
							wishlist_highlight_apps();
							fix_app_image_not_found();
							add_empty_wishlist_buttons();
							add_wishlist_filter();
							add_wishlist_total();
							add_wishlist_ajaxremove();
							add_wishlist_pricehistory();
							add_wishlist_notes();
							add_wishlist_search();
							wishlist_add_to_cart();
							wishlist_add_ratings();
							add_wishlist_sorts();

							// Wishlist highlights
							load_inventory().done(function() {
								start_highlights_and_tags();
							});	
							break;

						case /^\/chat\//.test(path):
							chat_dropdown_options(true);
							break;

						case /^\/(?:id|profiles)\/.+\/\b(home|myactivity|status)\b\/?$/.test(path):
							start_friend_activity_highlights();
							bind_ajax_content_highlighting();
							hide_activity_spam_comments();
							break;

						case /^\/(?:id|profiles)\/.+\/edit/.test(path):
							profileData.clearOwn();
							profileData.load();
							add_es_background_selection();
							add_es_style_selection();
							break;

						case /^\/(?:id|profiles)\/.+\/inventory/.test(path):
							bind_ajax_content_highlighting();
							inventory_market_prepare();
							hide_empty_inventory_tabs();
							keep_ssa_checked();
							add_inventory_gotopage();
							break;

						case /^\/(?:id|profiles)\/(.+)\/games/.test(path):
							total_time();
							total_size();
							add_gamelist_achievements();
							add_gamelist_sort();
							add_gamelist_filter();
							add_gamelist_common();
							break;

						case /^\/(?:id|profiles)\/.+\/badges(?!\/[0-9]+$)/.test(path):
							add_badge_completion_cost();
							add_total_drops_count();
							add_cardexchange_links();
							add_badge_sort();
							add_badge_filter();
							add_badge_view_options();
							break;

						case /^\/(?:id|profiles)\/.+\/stats/.test(path):
							add_achievement_sort();
							break;

						case /^\/(?:id|profiles)\/.+\/gamecards/.test(path):
							var gamecard = get_gamecard(path);
							add_cardexchange_links(gamecard);
							add_gamecard_market_links(gamecard);
							add_gamecard_foil_link();
							add_store_trade_forum_link(gamecard);
							break;

						case /^\/(?:id|profiles)\/.+\/friendsthatplay/.test(path):
							add_friends_that_play();
							add_friends_playtime_sort();
							break;

						case /^\/(?:id|profiles)\/.+\/friends(?:[/#?]|$)/.test(path):
							add_friends_sort();
							break;

						case /^\/(?:id|profiles)\/.+\/tradeoffers/.test(path):
							add_decline_button();
							break;

						case /^\/(?:id|profiles)\/.+\/groups/.test(path):
							groups_leave_options();
							break;
					}
					break;
			}
	});
});
