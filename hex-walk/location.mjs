// Do not echo browser error.message: it may contain URLs or implementation details.
export function locationProblem(env){
 if(!env.isSecureContext)return 'HTTPSではないため位置情報を利用できません。スマホでは案内された https:// のプレビューURLをSafari / Chromeで直接開いてください。回数は使っていません。';
 const policy=env.document?.permissionsPolicy||env.document?.featurePolicy;
 if(policy?.allowsFeature&&!policy.allowsFeature('geolocation'))return 'この画面では位置情報が埋め込み画面・サイトのポリシーで制限されています。プレビューURLをSafari / Chromeで直接開いてください。回数は使っていません。';
 if(!env.navigator?.geolocation)return 'このブラウザでは位置情報機能を利用できません。新しいSafari / Chromeで直接開いてください。回数は使っていません。';
 return '';
}
export function locationFailure(error){
 const suffix=' 今日の回数は使っていません。';
 if(error?.code===1||error?.name==='NotAllowedError'||error?.name==='SecurityError')return '位置情報の許可がありません（権限エラー）。端末の位置情報サービス、Safari / Chromeの位置情報権限、このサイトへの許可を確認してください。「正確な位置情報」も有効にしてください。OS側とサイト側のどちらが原因かはブラウザから判別できません。'+suffix;
 if(error?.code===2)return '現在地を取得できませんでした（取得不能）。GPS・通信状況や端末の位置情報設定を確認し、空が見える場所で再取得してください。詳しい原因はブラウザから取得できません。'+suffix;
 if(error?.code===3)return '位置情報の取得が時間切れになりました（15秒）。通信と端末の位置情報設定を確認し、空が見える場所で再取得してください。'+suffix;
 return '位置情報の取得を開始できませんでした（原因を特定できないエラー）。Safari / Chromeでページを開き直し、端末とサイトの位置情報許可を確認してください。'+suffix;
}
