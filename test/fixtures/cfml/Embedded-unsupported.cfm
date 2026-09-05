<cfcomponent output="false">
	<script type="application/json">
		function notJavascript() {}
	</script>
	<script type="#scriptType#">
		function dynamicTypeScript() {}
	</script>
	<script language="vbscript">
		function notVbscript() {}
	</script>

	<style type="text/less">
		.notCss {
			color: red;
		}
	</style>
	<style type="#styleType#">
		.dynamicTypeStyle {
			color: blue;
		}
	</style>
</cfcomponent>
