import os
import logging

logging.basicConfig(format='%(asctime)s %(name)s %(levelname)s %(message)s',
                    level=logging.INFO)

LOGGER = logging.getLogger(__name__)

# add project folder to path for generic loading
SETTINGSPATH = os.path.abspath(os.path.dirname(os.path.abspath(__file__)))

# detect environment, if no settings/env.py or settings.env.ENV empty
# keep defaults

FLEXI_RUN_ENV = 'test'

try:
    exec(open(os.path.join(SETTINGSPATH, 'env.py')).read())
    LOGGER.info('Using FLEXI_RUN_ENV from env.py')
except IOError:
    LOGGER.warn('No env.py file found, trying to find FLEXI_RUN_ENV in shell environment.')

# environment declaration takes precendence, convenient to run some
# quick tests
FLEXI_RUN_ENV = os.environ.get('FLEXI_RUN_ENV', FLEXI_RUN_ENV)

# import standard settings.py file
try:
    exec(open(os.path.join(SETTINGSPATH, 'settings.py')).read())
except IOError:
    LOGGER.warn('Copy your settings.py file in settings/')
    raise

# import running environment settings
if FLEXI_RUN_ENV:
    try:
        exec(open(
            os.path.join(SETTINGSPATH, 'settings_%s.py' % FLEXI_RUN_ENV)).read()
        )
        LOGGER.info('Using settings from settings_%s.py' % FLEXI_RUN_ENV)
    except IOError:
        LOGGER.warn('No settings module for %s environment' % FLEXI_RUN_ENV)
