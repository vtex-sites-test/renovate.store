const { merge } = require('webpack-merge')
const { optimize } = require('@vtex/gatsby-theme-store/sdk/img/fileManager')

const { GATSBY_VTEX_ACCOUNT } = process.env

exports.onCreateWebpackConfig = ({
  actions: { replaceWebpackConfig },
  stage,
  getConfig,
}) => {
  const gatsbyConfig = getConfig()

  // Use es6 module only on web-based targets
  const moduleConfig =
    stage === 'build-javascript'
      ? {
          output: {
            module: true,
          },
          experiments: {
            outputModule: true,
          },
        }
      : {}

  const webpackConfig = merge(gatsbyConfig, moduleConfig)

  // Targets modern browsers
  if (stage === 'build-javascript') {
    webpackConfig.target = ['web', 'es2017']
  }

  replaceWebpackConfig(webpackConfig)
}

const throwOnErrors = (errors, reporter) => {
  if (Array.isArray(errors) && errors.length > 0) {
    reporter.panicOnBuild(errors.toString())

    throw errors
  }
}

exports.onCreateNode = async ({ node, reporter }) => {
  if (node.internal.type !== 'vtexCmsPageContent') {
    return
  }

  const sizes = {
    mobile: [360, 480],
    desktop: [1280, 1440, 1920],
  }

  reporter.info(
    `[${GATSBY_VTEX_ACCOUNT}.store]: Optimizing Images for: ${node.name}`
  )

  // eslint-disable-next-line vtex/prefer-early-return
  if (node.type === 'plp' || node.type === 'productListLandingPage') {
    const banner = node.blocks.find((block) => block.name === 'SearchBanner')

    if (banner) {
      banner.props.sources = [
        {
          media: '(min-width: 40em)',
          srcSet: sizes.desktop
            .map(
              (width) =>
                `${optimize(banner.props.desktop.srcSet, {
                  width,
                  aspect: true,
                })} ${width}w`
            )
            .join(','),
        },
        {
          media: '(max-width: 40em)',
          srcSet: sizes.mobile
            .map(
              (width) =>
                `${optimize(banner.props.mobile.srcSet, {
                  width,
                  aspect: true,
                })} ${width}w`
            )
            .join(','),
        },
      ]

      delete banner.props.desktop
      delete banner.props.mobile
    }
  }
}

let resolveGraphQL = null
const graphqlPromise = new Promise((resolve) => {
  resolveGraphQL = resolve
})

exports.createPages = async ({ graphql }) => {
  resolveGraphQL(graphql)
}

// Use this API to capture the graphql executor function
const nodesByIds = (nodes) =>
  nodes.reduce((acc, node) => {
    const { props } = node.extraBlocks
      .find((block) => block.name === 'Parameters')
      .blocks.find((block) => block.name === 'SearchIdSelector')

    acc[props.id] = node

    return acc
  }, {})

exports.onCreatePage = async (args) => {
  const {
    page,
    reporter,
    actions: { createPage, deletePage },
  } = args

  const graphql = await graphqlPromise

  /**
   * Adds context to home page
   */
  if (
    page.path === '/' ||
    (page.context !== undefined &&
      typeof page.context.originalPath === 'string' &&
      page.context.originalPath === '/')
  ) {
    const home = await graphql(`
      query CMSContent {
        vtexCmsPageContent(type: { eq: "home" }) {
          blocks {
            name
            props
          }
        }
      }
    `)

    throwOnErrors(home.errors, reporter)

    if (!home.data.vtexCmsPageContent) {
      return
    }

    const {
      data: {
        vtexCmsPageContent: { blocks },
      },
    } = home

    const {
      props: { searchParams },
    } = blocks.find((x) => x.name === 'DynamicShelf')

    // Add context to home page

    deletePage(page)
    createPage({
      ...page,
      context: {
        ...page.context,
        ...searchParams,
      },
    })
  }

  /**
   * Adds context to search pages
   */
  if (!page.component.includes('/templates/search.')) {
    return
  }

  const plps = await graphql(`
    query CMSPageContent {
      allVtexCmsPageContent(
        filter: { extraBlocks: { elemMatch: { name: { eq: "Parameters" } } } }
      ) {
        nodes {
          blocks {
            name
            props
          }
          extraBlocks {
            name
            blocks {
              name
              props
            }
          }
        }
      }
    }
  `)

  throwOnErrors(plps.errors, reporter)

  const nodeMap = nodesByIds(plps.data.allVtexCmsPageContent.nodes)

  const {
    context: { canonicalPath },
  } = page

  deletePage(page)
  createPage({
    ...page,
    context: {
      ...page.context,
      vtexCmsPageContent: nodeMap[canonicalPath] || null,
    },
  })
}
